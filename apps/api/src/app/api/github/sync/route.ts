import { db } from "@rox/db/client";
import { githubInstallations } from "@rox/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { apiError } from "@/lib/api-response";
import { syncInstallationRepos } from "../sync-core";

const bodySchema = z.object({
	organizationId: z.string().uuid(),
});

export async function POST(request: Request) {
	if (env.NODE_ENV !== "development") {
		return apiError("This endpoint is only available in development", 403);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return apiError("Invalid JSON", 400);
	}

	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return apiError("Invalid payload", 400);
	}

	const { organizationId } = parsed.data;

	const [installation] = await db
		.select()
		.from(githubInstallations)
		.where(eq(githubInstallations.organizationId, organizationId))
		.limit(1);

	if (!installation) {
		return apiError("Installation not found", 404);
	}

	try {
		const { repositoriesCount } = await syncInstallationRepos({
			installation,
			organizationId,
			logPrefix: "[github/sync]",
		});

		console.log("[github/sync] Sync completed successfully");
		return Response.json({
			success: true,
			repositoriesCount,
		});
	} catch (error) {
		console.error("[github/sync] Sync failed:", error);
		return apiError(
			error instanceof Error ? error.message : "Sync failed",
			500,
		);
	}
}
