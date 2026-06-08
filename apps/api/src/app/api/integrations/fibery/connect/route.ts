import { auth } from "@rox/auth/server";
import { db } from "@rox/db/client";
import type { FiberyConfig } from "@rox/db/schema";
import { integrationConnections, members } from "@rox/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
	organizationId: z.string().uuid(),
	/** Fibery API token from Settings → API Tokens. */
	apiToken: z.string().min(1),
	/** Fibery account subdomain, e.g. "acme" for acme.fibery.io. */
	account: z.string().min(1),
});

type FiberyMeResponse = {
	name?: string;
	email?: string;
};

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

	const { organizationId, apiToken, account } = parsed.data;
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

	// Validate token by hitting the Fibery account info endpoint
	const validateRes = await fetch(`https://${account}.fibery.io/api/me`, {
		headers: {
			Authorization: `Token ${apiToken}`,
			"Content-Type": "application/json",
		},
	}).catch(() => null);

	if (!validateRes?.ok) {
		return Response.json(
			{ error: "Invalid API token or account" },
			{ status: 400 },
		);
	}

	const meData = (await validateRes.json()) as FiberyMeResponse;

	const config: FiberyConfig = {
		provider: "fibery",
		account,
	};

	await db
		.insert(integrationConnections)
		.values({
			organizationId,
			connectedByUserId: userId,
			provider: "fibery",
			accessToken: apiToken,
			externalOrgId: account,
			externalOrgName: meData.name ?? account,
			config,
		})
		.onConflictDoUpdate({
			target: [
				integrationConnections.organizationId,
				integrationConnections.provider,
			],
			set: {
				accessToken: apiToken,
				externalOrgId: account,
				externalOrgName: meData.name ?? account,
				connectedByUserId: userId,
				config,
				disconnectedAt: null,
				disconnectReason: null,
				updatedAt: new Date(),
			},
		});

	return Response.json({ success: true, account });
}
