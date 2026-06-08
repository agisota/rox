import { Client } from "@upstash/qstash";

import { env } from "@/env";
import { verifyDiscordSignature } from "../verify-signature";

const qstash = new Client({ token: env.QSTASH_TOKEN });

// Discord interaction types
const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_APPLICATION_COMMAND = 2;
const INTERACTION_TYPE_MESSAGE_COMPONENT = 3;

// Discord response types
const RESPONSE_TYPE_PONG = 1;

type DiscordInteraction = {
	id: string;
	type: number;
	token: string;
	guild_id?: string;
	channel_id?: string;
	member?: { user?: { id?: string } };
	user?: { id?: string };
	data?: {
		name?: string;
		custom_id?: string;
		options?: unknown[];
	};
};

export async function POST(request: Request) {
	const body = await request.text();

	const signature = request.headers.get("x-signature-ed25519");
	const timestamp = request.headers.get("x-signature-timestamp");

	if (!signature || !timestamp) {
		return Response.json(
			{ error: "Missing signature headers" },
			{ status: 401 },
		);
	}

	const publicKey = env.DISCORD_PUBLIC_KEY;
	if (!publicKey) {
		console.error("[discord/interactions] DISCORD_PUBLIC_KEY not configured");
		return Response.json({ error: "Not configured" }, { status: 503 });
	}

	if (!verifyDiscordSignature({ publicKey, signature, timestamp, body })) {
		console.error(
			"[discord/interactions] Ed25519 signature verification failed",
		);
		return Response.json(
			{ error: "Invalid request signature" },
			{ status: 401 },
		);
	}

	let interaction: DiscordInteraction;
	try {
		const parsed = JSON.parse(body);
		if (parsed === null || typeof parsed !== "object") {
			return Response.json({ error: "Invalid payload" }, { status: 400 });
		}
		interaction = parsed as DiscordInteraction;
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	// Discord requires PONG response to its PING to activate the interactions endpoint
	if (interaction.type === INTERACTION_TYPE_PING) {
		return Response.json({ type: RESPONSE_TYPE_PONG });
	}

	if (
		interaction.type === INTERACTION_TYPE_APPLICATION_COMMAND ||
		interaction.type === INTERACTION_TYPE_MESSAGE_COMPONENT
	) {
		// Queue async processing; respond immediately with deferred reply
		try {
			await qstash.publishJSON({
				url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/discord/jobs/process-interaction`,
				body: { interaction },
				retries: 3,
			});
		} catch (err) {
			console.error("[discord/interactions] Failed to queue interaction:", err);
		}

		// Deferred channel message — Discord will update via webhook after processing
		return Response.json({ type: 5 });
	}

	return Response.json({ type: RESPONSE_TYPE_PONG });
}
