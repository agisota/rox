import { Receiver } from "@upstash/qstash";
import { z } from "zod";
import { env } from "@/env";
import { processTelegramMessage } from "../../process-message";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

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
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");

	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const isValid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/telegram/jobs/process-message`,
	});

	if (!isValid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

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
