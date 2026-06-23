import { db } from "@rox/db/client";
import {
	integrationConnections,
	integrationInboundEvents,
} from "@rox/db/schema";
import { Client } from "@upstash/qstash";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { InteractionResponseType, InteractionType } from "../constants";
import { parseDiscordInteraction } from "../parse-interaction";
import { verifyDiscordSignature } from "../verify-signature";

const qstash = new Client({ token: env.QSTASH_TOKEN });

/**
 * Deferred ack telling Discord to show the bot's "thinking…" state. The real
 * answer is delivered later by editing this same response from the worker.
 *
 * Built fresh per call: a `Response` body is single-use, so a shared instance
 * could not be returned by more than one request.
 */
function deferredAck(): Response {
	return Response.json({
		type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
	});
}

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

		// Discord normally sends `application_id`; fall back to the stored config
		// so the worker can still address the follow-up edit if it is omitted.
		const applicationId =
			interaction.applicationId ??
			(connection.config?.provider === "discord"
				? connection.config.applicationId
				: undefined);

		// Without these we cannot dispatch or edit the deferred reply later. Still
		// defer (Discord shows one "thinking…" ack); the empty prompt simply leaves
		// it unanswered rather than erroring the user-visible interaction.
		if (
			!interaction.id ||
			!interaction.token ||
			!applicationId ||
			!interaction.text
		) {
			logger.warn(
				"[discord/interactions] Command missing dispatch fields; deferring without enqueue",
				{
					connectionId: connection.id,
					hasId: Boolean(interaction.id),
					hasToken: Boolean(interaction.token),
					hasApplicationId: Boolean(applicationId),
					hasText: Boolean(interaction.text),
				},
			);
			return deferredAck();
		}

		// Idempotency: Discord retries deliveries, and the interaction id is
		// globally unique. Scope it by connection so two connections cannot drop
		// each other's interaction sharing a provider-local id (mirrors Telegram).
		const dedupEventId = `${connection.id}:${interaction.id}`;
		const [inserted] = await db
			.insert(integrationInboundEvents)
			.values({
				connectionId: connection.id,
				provider: "discord",
				externalEventId: dedupEventId,
			})
			.onConflictDoNothing({
				target: [
					integrationInboundEvents.provider,
					integrationInboundEvents.externalEventId,
				],
			})
			.returning({ id: integrationInboundEvents.id });

		// Duplicate redelivery: the first delivery already enqueued the job. Defer
		// again so Discord stops retrying, but do not double-dispatch the agent.
		if (!inserted) {
			logger.info("[discord/interactions] Duplicate interaction ignored", {
				dedupEventId,
				connectionId: connection.id,
			});
			return deferredAck();
		}

		try {
			await qstash.publishJSON({
				url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/discord/jobs/process-interaction`,
				body: {
					connectionId: connection.id,
					interaction: {
						id: interaction.id,
						token: interaction.token,
						applicationId,
						text: interaction.text,
					},
				},
				retries: 3,
			});
		} catch (error) {
			logger.error(
				"[discord/interactions] Failed to queue process-interaction job:",
				error,
			);
			// Roll back the dedup row so a Discord retry can re-enqueue instead of
			// being silently dropped as a duplicate.
			try {
				await db
					.delete(integrationInboundEvents)
					.where(eq(integrationInboundEvents.id, inserted.id));
			} catch (deleteError) {
				logger.error(
					"[discord/interactions] Failed to roll back inbound event after queue failure:",
					deleteError,
				);
			}
		}

		// Always defer: the 3s ack must succeed regardless of enqueue outcome so
		// the user never sees an interaction failure; a missing follow-up is the
		// worst case, not a hard error.
		return deferredAck();
	}

	// MESSAGE_COMPONENT and any future types: ack until handled in a later PR.
	return new Response("ok", { status: 200 });
}
