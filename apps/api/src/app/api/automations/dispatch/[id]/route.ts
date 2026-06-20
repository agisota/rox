import { dbWs } from "@rox/db/client";
import { automations } from "@rox/db/schema";
import { dispatchAutomation } from "@rox/trpc/automation-dispatch";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { verifyQstash } from "@/lib/qstash-verify";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
	automationId: z.string().uuid(),
	scheduledFor: z.string().datetime(),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await params;
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/automations/dispatch/${id}`,
	});
	if (!verified.ok) {
		return verified.response;
	}
	const { body } = verified;

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[automations/dispatch] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const [automation] = await dbWs
		.select()
		.from(automations)
		.where(eq(automations.id, parsed.data.automationId))
		.limit(1);

	if (!automation) {
		return Response.json({ ok: true, skipped: "deleted" });
	}
	if (!automation.enabled) {
		return Response.json({ ok: true, skipped: "disabled" });
	}

	const outcome = await dispatchAutomation({
		automation,
		scheduledFor: new Date(parsed.data.scheduledFor),
		relayUrl: env.RELAY_URL,
	});

	return Response.json({ ok: true, outcome });
}
