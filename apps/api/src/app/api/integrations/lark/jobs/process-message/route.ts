import { z } from "zod";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { verifyQstash } from "@/lib/qstash-verify";
import { processLarkMessage } from "../../process-message";

export const maxDuration = 30;

const payloadSchema = z.object({
	connectionId: z.string().min(1),
	chatId: z.string().min(1),
	messageId: z.string().min(1).nullable(),
	eventId: z.string().min(1).nullable(),
	text: z.string().min(1),
});

export async function POST(request: Request) {
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/lark/jobs/process-message`,
		onError: "respond",
		logError: (error) =>
			logger.warn(
				"[lark/process-message-job] Signature verification failed:",
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
		logger.error("[lark/process-message-job] Invalid payload:", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const result = await processLarkMessage(parsed.data);
	return Response.json(result);
}
