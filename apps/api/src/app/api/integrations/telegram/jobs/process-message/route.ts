import { z } from "zod";
import { env } from "@/env";
import { verifyQstash } from "@/lib/qstash-verify";
import { processTelegramMessage } from "../../process-message";

export const maxDuration = 30;

const payloadSchema = z.object({
	connectionId: z.string().min(1),
	update: z.object({
		updateId: z.number(),
		chatId: z.number(),
		text: z.string().min(1),
		fromUserId: z.number(),
		fromIsBot: z.boolean(),
	}),
});

export async function POST(request: Request) {
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/telegram/jobs/process-message`,
		onError: "respond",
		logError: (error) =>
			console.warn(
				"[telegram/process-message-job] Signature verification failed:",
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
		console.error(
			"[telegram/process-message-job] Invalid payload:",
			parsed.error,
		);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const result = await processTelegramMessage(parsed.data);
	return Response.json(result);
}
