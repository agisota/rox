import { db } from "@rox/db/client";
import {
	integrationConnections,
	integrationInboundEvents,
} from "@rox/db/schema";
import { Client } from "@upstash/qstash";
import { and, eq, isNull } from "drizzle-orm";

import { env } from "@/env";
import { decryptLarkEvent, verifyLarkSignature } from "../verify-decrypt";

const qstash = new Client({ token: env.QSTASH_TOKEN });

type LarkEventEnvelope = {
	/** Present on encrypted events — base64(AES256CBC(payload)) */
	encrypt?: string;
	/** Challenge token for endpoint URL verification */
	challenge?: string;
	type?: string;
	schema?: string;
	header?: {
		event_id?: string;
		event_type?: string;
		tenant_key?: string;
		token?: string;
	};
	event?: Record<string, unknown>;
};

export async function POST(request: Request) {
	const body = await request.text();

	// Verify Lark signature on non-encrypted events
	const larkSignature = request.headers.get("x-lark-signature");
	const larkTimestamp = request.headers.get("x-lark-request-timestamp");
	const larkNonce = request.headers.get("x-lark-request-nonce");

	const encryptKey = env.LARK_ENCRYPT_KEY;

	if (larkSignature && larkTimestamp && larkNonce && encryptKey) {
		if (
			!verifyLarkSignature({
				timestamp: larkTimestamp,
				nonce: larkNonce,
				encryptKey,
				body,
				signature: larkSignature,
			})
		) {
			console.error("[lark/events] Signature verification failed");
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	}

	// Decrypt if needed
	let rawPayload: string = body;
	let envelope: LarkEventEnvelope;

	try {
		const firstParse = JSON.parse(body);
		if (firstParse === null || typeof firstParse !== "object") {
			return Response.json({ error: "Invalid payload" }, { status: 400 });
		}

		const maybeEncrypted = firstParse as LarkEventEnvelope;

		if (maybeEncrypted.encrypt) {
			if (!encryptKey) {
				console.error(
					"[lark/events] Received encrypted event but LARK_ENCRYPT_KEY not set",
				);
				return Response.json(
					{ error: "Encryption not configured" },
					{ status: 503 },
				);
			}
			try {
				rawPayload = decryptLarkEvent(encryptKey, maybeEncrypted.encrypt);
			} catch (err) {
				console.error("[lark/events] Decryption failed:", err);
				return Response.json({ error: "Decryption failed" }, { status: 400 });
			}

			const decrypted = JSON.parse(rawPayload);
			if (decrypted === null || typeof decrypted !== "object") {
				return Response.json(
					{ error: "Invalid decrypted payload" },
					{ status: 400 },
				);
			}
			envelope = decrypted as LarkEventEnvelope;
		} else {
			envelope = maybeEncrypted;
		}
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	// Lark endpoint verification challenge
	if (envelope.challenge) {
		return Response.json({ challenge: envelope.challenge });
	}

	const eventId = envelope.header?.event_id;
	const tenantKey = envelope.header?.tenant_key;

	if (!eventId) {
		console.warn("[lark/events] Missing event_id in header");
		return Response.json({ ok: true });
	}

	// Dedup
	const alreadySeen = await db.query.integrationInboundEvents.findFirst({
		where: and(
			eq(integrationInboundEvents.provider, "lark"),
			eq(integrationInboundEvents.externalEventId, eventId),
		),
		columns: { id: true },
	});

	if (alreadySeen) {
		return Response.json({ ok: true, status: "duplicate" });
	}

	// Look up connection by tenant key or any active Lark connection
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.provider, "lark"),
			isNull(integrationConnections.disconnectedAt),
			...(tenantKey
				? [eq(integrationConnections.externalOrgId, tenantKey)]
				: []),
		),
		columns: { id: true, organizationId: true },
	});

	if (!connection) {
		console.warn(
			"[lark/events] No active Lark connection found for tenant:",
			tenantKey,
		);
		return Response.json({ ok: true, status: "no_connection" });
	}

	await db
		.insert(integrationInboundEvents)
		.values({
			connectionId: connection.id,
			provider: "lark",
			externalEventId: eventId,
		})
		.onConflictDoNothing();

	try {
		await qstash.publishJSON({
			url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/lark/jobs/process-event`,
			body: {
				envelope,
				connectionId: connection.id,
				organizationId: connection.organizationId,
			},
			retries: 3,
		});
	} catch (err) {
		console.error("[lark/events] Failed to queue event:", err);
	}

	// Lark requires a 200 within 3s
	return Response.json({ ok: true });
}
