/**
 * POST /api/mail/events — the Resend delivery webhook (D3 / M4).
 *
 * Resend signs every webhook with the Svix scheme. This route:
 *   1. verifies the Svix signature + timestamp skew (replay window);
 *   2. dedups on `svix-id` via `mail_events_provider_evt_uniq`;
 *   3. advances the matching `mail_messages.status`
 *      (delivered|bounced|complained|failed);
 *   4. on a complaint, bumps the sending address's complaint counter.
 *
 * GATED: inert without `RESEND_WEBHOOK_SECRET`. With no secret configured the
 * route fails closed (503) rather than accepting an unauthenticated POST —
 * mirrors the inbound mail webhook + the dv.net webhook.
 *
 * Response contract:
 *   200 {ok:true}            401 bad-sig / replay / missing headers
 *   400 malformed body       503 not configured
 */

import { apiError } from "@/lib/api-response";
import { processResendEvent } from "@/lib/mail/events";
import { createMailEventsDb } from "@/lib/mail/eventsDb";
import {
	readSvixHeaders,
	verifyResendWebhook,
} from "@/lib/mail/resend-webhook";

export const dynamic = "force-dynamic";

function getWebhookSecret(): string | null {
	const secret = process.env.RESEND_WEBHOOK_SECRET;
	return secret && secret.length > 0 ? secret : null;
}

export async function POST(request: Request): Promise<Response> {
	const secret = getWebhookSecret();
	if (!secret) {
		// No secret configured → the route is not provisioned. Fail closed.
		return apiError("Mail events webhook is not configured", 503);
	}

	// Read the raw body BEFORE parsing — the Svix signature is over exact bytes.
	const rawBody = await request.text();

	const verification = await verifyResendWebhook({
		secret,
		body: rawBody,
		headers: readSvixHeaders(request.headers),
	});
	if (!verification.ok) {
		return apiError(`Rejected: ${verification.reason}`, 401);
	}

	let json: unknown;
	try {
		json = JSON.parse(rawBody);
	} catch {
		return apiError("Malformed JSON body", 400);
	}
	if (typeof json !== "object" || json === null) {
		return apiError("Invalid event body", 400);
	}

	const result = await processResendEvent(
		createMailEventsDb(),
		verification.id,
		json as Record<string, unknown>,
	);

	return Response.json({ ok: true, result });
}
