import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@rox/db/client";
import type { FiberyConfig } from "@rox/db/schema";
import {
	integrationConnections,
	integrationInboundEvents,
} from "@rox/db/schema";
import { Client } from "@upstash/qstash";
import { and, eq, isNull } from "drizzle-orm";

import { env } from "@/env";

const qstash = new Client({ token: env.QSTASH_TOKEN });

type FiberyWebhookPayload = {
	id?: string;
	type?: string;
	entity?: { id?: string; type?: string };
};

/**
 * Verifies Fibery webhook payload with HMAC-SHA256 using the connection's
 * stored API token as the signing secret (Fibery doesn't issue a separate
 * webhook signing key — the API token is the shared secret).
 */
function verifyFiberySignature(
	body: string,
	signature: string,
	apiToken: string,
): boolean {
	try {
		const computed = `sha256=${createHmac("sha256", apiToken).update(body).digest("hex")}`;
		const a = Buffer.from(computed, "utf8");
		const b = Buffer.from(signature, "utf8");
		if (a.length !== b.length) return false;
		return timingSafeEqual(a, b);
	} catch {
		return false;
	}
}

export async function POST(request: Request) {
	const body = await request.text();

	// Fibery sends X-Fibery-Signature: sha256=<hex>
	const signature = request.headers.get("x-fibery-signature");
	const eventId =
		request.headers.get("x-fibery-event-id") ??
		`fibery-${Date.now()}-${Math.random().toString(36).slice(2)}`;

	// Dedup before signature verification to short-circuit duplicates cheaply
	const alreadySeen = await db.query.integrationInboundEvents.findFirst({
		where: and(
			eq(integrationInboundEvents.provider, "fibery"),
			eq(integrationInboundEvents.externalEventId, eventId),
		),
		columns: { id: true },
	});

	if (alreadySeen) {
		return Response.json({ ok: true, status: "duplicate" });
	}

	// Find active Fibery connection for signature verification
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.provider, "fibery"),
			isNull(integrationConnections.disconnectedAt),
		),
		columns: {
			id: true,
			organizationId: true,
			accessToken: true,
			config: true,
		},
	});

	if (!connection) {
		console.warn("[fibery/webhook] No active Fibery connection found");
		return Response.json({ ok: true, status: "no_connection" });
	}

	// Verify signature when present
	if (signature) {
		const config = connection.config as FiberyConfig | null;
		const signingToken = config?.account
			? connection.accessToken
			: connection.accessToken;

		if (!verifyFiberySignature(body, signature, signingToken)) {
			console.error("[fibery/webhook] Signature verification failed");
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	}

	let payload: FiberyWebhookPayload;
	try {
		const parsed = JSON.parse(body);
		if (parsed === null || typeof parsed !== "object") {
			return Response.json({ error: "Invalid payload" }, { status: 400 });
		}
		payload = parsed as FiberyWebhookPayload;
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	await db
		.insert(integrationInboundEvents)
		.values({
			connectionId: connection.id,
			provider: "fibery",
			externalEventId: eventId,
		})
		.onConflictDoNothing();

	try {
		await qstash.publishJSON({
			url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/fibery/jobs/process-event`,
			body: {
				payload,
				connectionId: connection.id,
				organizationId: connection.organizationId,
			},
			retries: 3,
		});
	} catch (err) {
		console.error("[fibery/webhook] Failed to queue event:", err);
	}

	return Response.json({ ok: true });
}
