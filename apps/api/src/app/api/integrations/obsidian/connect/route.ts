import { auth } from "@rox/auth/server";
import { db } from "@rox/db/client";
import type { ObsidianConfig } from "@rox/db/schema";
import { integrationConnections, members } from "@rox/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
	organizationId: z.string().uuid(),
	/** API key issued by the Obsidian Local REST API community plugin. */
	restApiToken: z.string().min(1),
	/** e.g. "My Vault" — reported by the Local REST API plugin. */
	vaultName: z.string().optional(),
});

/**
 * Stores an Obsidian Local REST API token for the org.
 *
 * Obsidian uses a local REST plugin running on the user's machine — there is no
 * hosted OAuth flow. The desktop/web client collects the token and posts it here.
 * Server-side verification is not possible because the plugin endpoint is only
 * reachable on the user's LAN.
 */
export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(rawBody);
	if (!parsed.success) {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}

	const { organizationId, restApiToken, vaultName } = parsed.data;
	const userId = session.user.id;

	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});

	if (!membership) {
		return Response.json(
			{ error: "Not a member of this organization" },
			{ status: 403 },
		);
	}

	const config: ObsidianConfig = {
		provider: "obsidian",
		...(vaultName ? { vaultName } : {}),
	};

	await db
		.insert(integrationConnections)
		.values({
			organizationId,
			connectedByUserId: userId,
			provider: "obsidian",
			accessToken: restApiToken,
			externalOrgName: vaultName,
			config,
		})
		.onConflictDoUpdate({
			target: [
				integrationConnections.organizationId,
				integrationConnections.provider,
			],
			set: {
				accessToken: restApiToken,
				externalOrgName: vaultName,
				connectedByUserId: userId,
				config,
				disconnectedAt: null,
				disconnectReason: null,
				updatedAt: new Date(),
			},
		});

	return Response.json({ success: true });
}
