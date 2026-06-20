import { timingSafeEqual } from "node:crypto";
import { db } from "@rox/db/client";
import type { LarkConfig } from "@rox/db/schema";
import { integrationConnections } from "@rox/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { LARK_EVENT_TYPE } from "../constants";
import { parseLarkEnvelope } from "../parse-event";

/**
 * Constant-time secret comparison. Length-guarded because `timingSafeEqual`
 * throws on unequal-length buffers; the early length check leaks only the
 * length, not the content, which is acceptable for these echoed tokens.
 */
function safeEqual(a: string, b: string): boolean {
	const aBuf = Buffer.from(a);
	const bBuf = Buffer.from(b);
	if (aBuf.length !== bBuf.length) return false;
	return timingSafeEqual(aBuf, bBuf);
}

// Inbound endpoint for Lark/Feishu event subscriptions (plaintext mode).
//
// Unlike Slack, Lark has no HMAC request signature in plaintext mode: auth is
// the per-connection `verificationToken`, which Lark echoes in every payload
// (`header.token` for v2 events, top-level `token` for URL verification). We
// resolve the org connection by `header.app_id === config.appId` and then check
// the token matches before accepting.
//
// AES-encrypted event mode (where the body is an `{ encrypt: "..." }` blob) is
// OUT OF SCOPE for this PR.

/** Narrow a stored integration config to the Lark variant. */
function asLarkConfig(config: unknown): LarkConfig | null {
	if (config && typeof config === "object" && "provider" in config) {
		const candidate = config as { provider?: unknown };
		if (candidate.provider === "lark") return config as LarkConfig;
	}
	return null;
}

export async function POST(request: Request) {
	const body = await request.text();

	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(body);
	} catch {
		logger.error("[lark/events] Failed to parse JSON payload");
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	const envelope = parseLarkEnvelope(parsedBody);

	// Unrecognised shape (e.g. AES `{ encrypt }` mode, or junk): ack so Lark
	// does not retry, but take no action.
	if (envelope === null) {
		return new Response("ok", { status: 200 });
	}

	// URL verification: respond with the same challenge ONLY when the token
	// matches an active Lark connection. We scan active connections and compare
	// the stored verificationToken; mismatches get 401.
	if (envelope.kind === "url_verification") {
		const connections = await db.query.integrationConnections.findMany({
			where: and(
				eq(integrationConnections.provider, "lark"),
				isNull(integrationConnections.disconnectedAt),
			),
			columns: { id: true, config: true },
			orderBy: [asc(integrationConnections.id)],
		});

		const matched = connections.some((connection) => {
			const config = asLarkConfig(connection.config);
			return (
				typeof config?.verificationToken === "string" &&
				safeEqual(config.verificationToken, envelope.token)
			);
		});

		if (!matched) {
			logger.error("[lark/events] URL verification token mismatch");
			return Response.json({ error: "Invalid token" }, { status: 401 });
		}

		return Response.json({ challenge: envelope.challenge });
	}

	// Event callback: resolve the org connection by app_id.
	if (envelope.appId === null) {
		return new Response("ok", { status: 200 });
	}

	const connections = await db.query.integrationConnections.findMany({
		where: and(
			eq(integrationConnections.provider, "lark"),
			isNull(integrationConnections.disconnectedAt),
		),
		columns: { id: true, organizationId: true, config: true },
		orderBy: [asc(integrationConnections.id)],
	});

	const connection = connections.find((candidate) => {
		const config = asLarkConfig(candidate.config);
		return config?.appId === envelope.appId;
	});

	// No active connection for this Lark app: ack without acting.
	if (!connection) {
		return new Response("ok", { status: 200 });
	}

	const config = asLarkConfig(connection.config);
	if (
		typeof config?.verificationToken !== "string" ||
		typeof envelope.token !== "string" ||
		!safeEqual(config.verificationToken, envelope.token)
	) {
		logger.error("[lark/events] Event token mismatch for app:", envelope.appId);
		return Response.json({ error: "Invalid token" }, { status: 401 });
	}

	// Only react to inbound user messages with text; ack everything else.
	const isMessageReceive =
		envelope.eventType === LARK_EVENT_TYPE.MESSAGE_RECEIVE;
	const hasText = typeof envelope.text === "string" && envelope.text.length > 0;
	if (!isMessageReceive || envelope.senderIsBot || !hasText) {
		return new Response("ok", { status: 200 });
	}

	logger.info("[lark/events] message received", {
		connectionId: connection.id,
		organizationId: connection.organizationId,
		appId: envelope.appId,
		chatId: envelope.chatId,
		senderOpenId: envelope.senderOpenId,
	});

	// TODO(lark PR-2): enqueue job -> runLarkAgent; AES-encrypted event mode.

	// Lark expects a fast 200 for accepted events.
	return new Response("ok", { status: 200 });
}
