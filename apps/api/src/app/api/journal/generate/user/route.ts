/**
 * Journal daily generation — per-user worker (journal-memory epic).
 *
 * Enqueued by the fan-out endpoint. Verifies the QStash signature, then runs R1
 * generation for one (organization, user, day) and upserts the journal entry +
 * memory suggestions. When the user has no sessions that day and no entry yet,
 * falls back to a GitHub-profile seed entry (first-time onboarding) so the
 * Журнал isn't empty on day one. Returns the generation result for QStash logging.
 */

import { z } from "zod";
import { env } from "@/env";
import {
	generateJournalForUserDay,
	generateJournalSeedForUser,
} from "@/lib/journal/journal-generation";
import { verifyQstash } from "@/lib/qstash-verify";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
	organizationId: z.string().uuid(),
	userId: z.string().uuid(),
	day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request): Promise<Response> {
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/journal/generate/user`,
		onError: "false",
	});
	if (!verified.ok) {
		return verified.response;
	}
	const { body } = verified;

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
	// First-time onboarding: no sessions yet → seed a journal entry from the
	// user's GitHub profile so the Журнал isn't empty on day one.
	if (result.status === "skipped" && result.reason === "no-sessions") {
		const seed = await generateJournalSeedForUser(parsed.data);
		return Response.json(seed);
	}
	return Response.json(result);
}
