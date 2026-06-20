import { db } from "@rox/db/client";
import { integrationConnections } from "@rox/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { InteractionResponseType, InteractionType } from "../constants";
import { parseDiscordInteraction } from "../parse-interaction";
import { verifyDiscordSignature } from "../verify-signature";

/**
 * Discord interactions webhook. Single Rox Discord app, many guilds (mirrors the
 * Slack team model). Every request is Ed25519-signed; we verify against the app
 * public key, then resolve the originating Rox connection by `guild_id`.
 *
 * Never throws to the client: malformed or unauthenticated requests get a 4xx,
 * unknown guilds get a silent 200 ack, and humans issuing a slash command get a
 * deferred ack so the real reply can be edited in later.
 */
export async function POST(request: Request) {
	const rawBody = await request.text();
	const signatureHex = request.headers.get("x-signature-ed25519");
	const timestamp = request.headers.get("x-signature-timestamp");

	if (!signatureHex || !timestamp) {
		return Response.json(
			{ error: "Missing signature headers" },
			{ status: 401 },
		);
	}

	// Replay guard: Discord signs `timestamp + body`, so a captured request stays
	// valid forever without a freshness window. Reject timestamps more than 5 min
	// from now (past or future), mirroring the Slack verify path.
	const timestampSec = Number.parseInt(timestamp, 10);
	const nowSec = Math.floor(Date.now() / 1000);
	if (
		!Number.isFinite(timestampSec) ||
		Math.abs(nowSec - timestampSec) > 60 * 5
	) {
		logger.error("[discord/interactions] Timestamp too old or in future");
		return Response.json({ error: "Stale request" }, { status: 401 });
	}

	// Optional until the Discord app is provisioned in this environment.
	const publicKeyHex = env.DISCORD_PUBLIC_KEY;
	if (!publicKeyHex) {
		logger.error("[discord/interactions] DISCORD_PUBLIC_KEY is not configured");
		return Response.json(
			{ error: "Discord integration is not configured" },
			{ status: 503 },
		);
	}

	if (
		!verifyDiscordSignature({ publicKeyHex, signatureHex, timestamp, rawBody })
	) {
		logger.error("[discord/interactions] Signature verification failed");
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	let json: unknown;
	try {
		json = JSON.parse(rawBody);
	} catch {
		logger.error("[discord/interactions] Failed to parse JSON payload");
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	const interaction = parseDiscordInteraction(json);
	if (!interaction) {
		logger.error("[discord/interactions] Invalid interaction payload shape");
		return Response.json({ error: "Invalid payload shape" }, { status: 400 });
	}

	// Discord verifies the endpoint by sending a PING it expects a PONG for.
	if (interaction.type === InteractionType.PING) {
		return Response.json({ type: InteractionResponseType.PONG });
	}

	// Resolve the Rox connection for this guild. config is jsonb, so match
	// config.guildId in JS over active discord connections (same approach as the
	// Telegram/Linear verticals).
	const guildId = interaction.guildId;
	if (!guildId) {
		// Interactions outside a guild (e.g. DMs) have no connection to resolve.
		return new Response("ok", { status: 200 });
	}

	const connections = await db.query.integrationConnections.findMany({
		where: and(
			eq(integrationConnections.provider, "discord"),
			isNull(integrationConnections.disconnectedAt),
		),
		columns: { id: true, organizationId: true, config: true },
	});

	const connection = connections.find(
		(row) =>
			row.config?.provider === "discord" && row.config.guildId === guildId,
	);

	if (!connection) {
		// Unknown guild: ack without leaking whether the guild is known.
		return new Response("ok", { status: 200 });
	}

	if (interaction.type === InteractionType.APPLICATION_COMMAND) {
		logger.info("[discord/interactions] Application command received", {
			connectionId: connection.id,
			organizationId: connection.organizationId,
			guildId,
			channelId: interaction.channelId,
			userId: interaction.userId,
			commandName: interaction.commandName,
		});

		// TODO(discord PR-2): enqueue job -> runDiscordAgent -> edit deferred reply
		return Response.json({
			type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
		});
	}

	// MESSAGE_COMPONENT and any future types: ack until handled in a later PR.
	return new Response("ok", { status: 200 });
}
