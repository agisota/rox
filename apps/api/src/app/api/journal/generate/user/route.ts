/**
 * Journal daily generation — per-user worker (journal-memory epic).
 *
 * Enqueued by the fan-out endpoint. Verifies the QStash signature, then runs R1
 * generation for one (organization, user, day) and upserts the journal entry +
 * memory suggestions. Returns the generation result for QStash logging.
 */

import { Receiver } from "@upstash/qstash";
import { z } from "zod";
import { env } from "@/env";
import { generateJournalForUserDay } from "@/lib/journal/journal-generation";

export const dynamic = "force-dynamic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const inputSchema = z.object({
	organizationId: z.string().uuid(),
	userId: z.string().uuid(),
	day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}
	const valid = await receiver
		.verify({
			body,
			signature,
			url: `${env.NEXT_PUBLIC_API_URL}/api/journal/generate/user`,
		})
		.catch(() => false);
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}
	const parsed = inputSchema.safeParse(parsedBody);
	if (!parsed.success) {
		return Response.json({ error: "Invalid input" }, { status: 400 });
	}

	const result = await generateJournalForUserDay(parsed.data);
	return Response.json(result);
}
