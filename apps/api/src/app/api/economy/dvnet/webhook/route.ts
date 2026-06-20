import { db } from "@rox/db/client";
import { roxBalances, roxLedger, roxTopups } from "@rox/db/schema";
import {
	DvNetWebhookError,
	normalizeDvNetWebhook,
} from "@rox/shared/dvnet-client";
import { toLedgerKind } from "@rox/shared/rox-ledger-kind";
import { creditConfirmedPayment } from "@rox/shared/rox-topup";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { apiError } from "@/lib/api-response";

/**
 * dv.net top-up webhook (WS-E T5) — the payment-in path.
 *
 * dv.net POSTs the (confirmed) charge here; we reconcile it against the pending
 * `rox_topups` row by `order_id` (which is our row id) and, on a confirmed
 * USDT payment, atomically: mark the topup `confirmed`, append a `topup` ledger
 * entry, and credit the user's Rox balance.
 *
 * Idempotency: the durable key is the topup row's `status`. An already-confirmed
 * row is a no-op 200 — a replayed webhook or a reconciliation poll that races
 * the webhook can never double-credit. Validation failures are loud (400) so a
 * spoofed/corrupt body is rejected rather than silently credited.
 */
export async function POST(request: Request) {
	// dv.net is temporarily disabled (not in use). This webhook has NO inbound
	// signature verification, so while disabled we reject every call instead of
	// crediting Rox balance on unauthenticated requests. Re-enabling requires
	// DVNET_ENABLED="true" AND adding signature verification first.
	if (env.DVNET_ENABLED !== "true") {
		return apiError("dv.net integration disabled", 503);
	}

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return apiError("Malformed JSON body", 400);
	}

	// `order_id` is our pending-topup row id; it lives on the raw body, not on the
	// normalized CryptoPayment, so read it before normalizing.
	const orderId =
		typeof rawBody === "object" && rawBody !== null
			? (rawBody as Record<string, unknown>).order_id
			: undefined;
	if (typeof orderId !== "string" || orderId.trim() === "") {
		return apiError("Webhook missing order_id", 400);
	}

	let payment: ReturnType<typeof normalizeDvNetWebhook>;
	try {
		payment = normalizeDvNetWebhook(rawBody);
	} catch (error) {
		if (error instanceof DvNetWebhookError) {
			return apiError(error.message, 400);
		}
		throw error;
	}

	const topup = await db.query.roxTopups.findFirst({
		where: eq(roxTopups.id, orderId.trim()),
	});
	if (!topup) {
		return apiError("No top-up matches order_id", 404);
	}

	// Durable idempotency: a confirmed row was already credited.
	if (topup.status === "confirmed") {
		return new Response("ok", { status: 200 });
	}

	const result = creditConfirmedPayment(0, payment, new Set());
	if (!result.credited) {
		// Unconfirmed / unsupported-asset / non-positive: ack so dv.net stops
		// retrying, but leave the row pending so a later confirmed webhook (or the
		// reconciliation poll) can still settle it.
		return new Response("ok", { status: 200 });
	}

	await db.transaction(async (tx) => {
		// Re-seed defensively in case the balance row never existed; the column
		// default (500) means a brand-new row would already hold the starting
		// grant, so read the current balance and add the credited Rox to it.
		await tx
			.insert(roxBalances)
			.values({ userId: topup.userId })
			.onConflictDoNothing({ target: roxBalances.userId });

		const balanceRow = await tx.query.roxBalances.findFirst({
			where: eq(roxBalances.userId, topup.userId),
			columns: { balanceRox: true },
		});
		const current = balanceRow ? Number(balanceRow.balanceRox) : 0;
		const credited = creditConfirmedPayment(current, payment, new Set());
		if (!credited.credited) return;

		await tx
			.update(roxTopups)
			.set({ status: "confirmed", confirmedAt: new Date() })
			.where(eq(roxTopups.id, topup.id));

		await tx.insert(roxLedger).values({
			userId: topup.userId,
			deltaRox: String(credited.entry.delta),
			kind: toLedgerKind("topup"),
			topupId: topup.id,
		});

		await tx
			.update(roxBalances)
			.set({ balanceRox: String(credited.balanceAfter) })
			.where(eq(roxBalances.userId, topup.userId));
	});

	return new Response("ok", { status: 200 });
}
