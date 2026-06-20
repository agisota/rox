import { db } from "@rox/db/client";
import { githubInstallations } from "@rox/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { verifyQstash } from "@/lib/qstash-verify";
import { syncInstallationRepos } from "../../sync-core";

const payloadSchema = z.object({
	installationDbId: z.string().uuid(),
	organizationId: z.string().uuid(),
});

export async function POST(request: Request) {
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/initial-sync`,
		devBypass: env.NODE_ENV === "development",
		onError: "false",
		logError: (error) =>
			console.error(
				"[github/initial-sync] Signature verification failed:",
				error,
			),
	});
	if (!verified.ok) {
		return verified.response;
	}
	const { body } = verified;

	let bodyData: unknown;
	try {
		bodyData = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = payloadSchema.safeParse(bodyData);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { installationDbId, organizationId } = parsed.data;

	const [installation] = await db
		.select()
		.from(githubInstallations)
		.where(eq(githubInstallations.id, installationDbId))
		.limit(1);

	if (!installation) {
		return Response.json(
			{ error: "Installation not found", skipped: true },
			{ status: 404 },
		);
	}

	try {
		await syncInstallationRepos({
			installation,
			organizationId,
			logPrefix: "[github/initial-sync]",
		});

		console.log("[github/initial-sync] Sync completed successfully");
		return Response.json({ success: true });
	} catch (error) {
		console.error("[github/initial-sync] Sync failed:", error);
		return Response.json(
			{ error: error instanceof Error ? error.message : "Sync failed" },
			{ status: 500 },
		);
	}
}
