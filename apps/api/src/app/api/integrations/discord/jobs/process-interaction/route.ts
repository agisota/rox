import { z } from "zod";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { verifyQstash } from "@/lib/qstash-verify";
import { processDiscordInteraction } from "../../process-interaction";

export const maxDuration = 30;

const payloadSchema = z.object({
	connectionId: z.string().min(1),
	interaction: z.object({
		id: z.string().min(1),
		token: z.string().min(1),
		applicationId: z.string().min(1),
		text: z.string().min(1),
	}),
});

export async function POST(request: Request) {
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/discord/jobs/process-interaction`,
		onError: "respond",
		logError: (error) =>
			logger.warn(
				"[discord/process-interaction-job] Signature verification failed:",
				error,
			),
	});
	if (!verified.ok) {
		return verified.response;
	}
	const { body } = verified;

	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = payloadSchema.safeParse(json);
	if (!parsed.success) {
		logger.error(
			"[discord/process-interaction-job] Invalid payload:",
			parsed.error,
		);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const result = await processDiscordInteraction(parsed.data);
	return Response.json(result);
}
