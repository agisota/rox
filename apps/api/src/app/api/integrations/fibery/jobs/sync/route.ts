import { buildConflictUpdateColumns, db } from "@rox/db";
import type { FiberyConfig } from "@rox/db/schema";
import { integrationConnections, taskStatuses, tasks } from "@rox/db/schema";
import { decodeSecret } from "@rox/trpc/integration-secret";
import { and, asc, eq } from "drizzle-orm";
import chunk from "lodash.chunk";
import { z } from "zod";
import { env } from "@/env";
import { verifyQstash } from "@/lib/qstash-verify";
import { type FiberyCommand, runCommands } from "../../fibery-client";
import { type FiberyEntity, mapFiberyEntities } from "../../sync";

const BATCH_SIZE = 100;

const payloadSchema = z.object({
	organizationId: z.string().min(1),
	workspaceId: z.string().min(1).optional(),
	/** Creator assigned to newly-synced tasks; required for the real upsert. */
	creatorUserId: z.string().min(1).optional(),
	/**
	 * Fibery commands to run. Left configurable so the query shape (database,
	 * fields, filters) can evolve without code changes. Defaults to a no-op
	 * empty batch when omitted.
	 */
	commands: z
		.array(z.object({ command: z.string().min(1), args: z.unknown() }))
		.optional(),
});

/**
 * Resolves the active Fibery connection for an org and decodes its token.
 * Mirrors `getLinearClient`: returns `null` when there is no connection, it is
 * disconnected, or the stored account is missing.
 */
async function resolveFiberyConnection(organizationId: string): Promise<{
	account: string;
	token: string;
} | null> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "fibery"),
		),
	});

	if (!connection || connection.disconnectedAt) {
		return null;
	}

	const config = connection.config as FiberyConfig | null;
	const account = config?.account;
	if (!account) {
		return null;
	}

	return { account, token: decodeSecret(connection.accessToken) };
}

/**
 * Picks a default status id for the org to attach freshly-synced Fibery tasks
 * to (lowest position). Fibery state -> status mapping is out of scope for the
 * foundation; the normalized `externalState` is retained for a later mapper.
 */
async function resolveDefaultStatusId(
	organizationId: string,
): Promise<string | null> {
	const status = await db.query.taskStatuses.findFirst({
		where: eq(taskStatuses.organizationId, organizationId),
		orderBy: asc(taskStatuses.position),
		columns: { id: true },
	});
	return status?.id ?? null;
}

/** Extracts the entity array from the first command result envelope. */
function extractEntities(result: unknown): FiberyEntity[] {
	if (Array.isArray(result)) {
		return result as FiberyEntity[];
	}
	return [];
}

export async function POST(request: Request) {
	// Skip signature verification in development (QStash can't reach localhost).
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/fibery/jobs/sync`,
		devBypass: env.NODE_ENV === "development",
	});
	if (!verified.ok) {
		return verified.response;
	}
	const { body } = verified;

	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	const parsed = payloadSchema.safeParse(parsedBody);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { organizationId, creatorUserId, commands } = parsed.data;

	const connection = await resolveFiberyConnection(organizationId);
	if (!connection) {
		return Response.json({
			success: true,
			skipped: true,
			reason: "No Fibery connection or connection disconnected",
		});
	}

	const fiberyCommands: FiberyCommand[] = commands ?? [];
	const results = await runCommands({
		account: connection.account,
		token: connection.token,
		commands: fiberyCommands,
	});

	const entities = results.flatMap((r) =>
		r.success ? extractEntities(r.result) : [],
	);
	const mappedTasks = mapFiberyEntities(entities, { organizationId });

	// "fibery" IS an allowed `externalProvider` enum value (see
	// packages/db/src/schema/enums.ts -> integrationProviderValues), so the
	// upsert below runs without any migration. We still guard on the
	// prerequisites a `tasks` row needs (non-null creator + status); when either
	// is missing we log the mapped count and skip persistence, keeping the route
	// always-200.
	const statusId = await resolveDefaultStatusId(organizationId);

	if (!creatorUserId || !statusId || mappedTasks.length === 0) {
		console.info(
			`[fibery:sync] mapped ${mappedTasks.length} task(s) for org ${organizationId}; upsert skipped`,
			{
				hasCreator: Boolean(creatorUserId),
				hasStatus: Boolean(statusId),
			},
		);
		return Response.json({
			success: true,
			mapped: mappedTasks.length,
			upserted: false,
		});
	}

	const now = new Date();
	const taskValues = mappedTasks.map((task) => ({
		organizationId: task.organizationId,
		creatorId: creatorUserId,
		statusId,
		slug: task.externalId,
		title: task.title,
		externalProvider: "fibery" as const,
		externalId: task.externalId,
		lastSyncedAt: now,
	}));

	const batches = chunk(taskValues, BATCH_SIZE);
	for (const batch of batches) {
		await db
			.insert(tasks)
			.values(batch)
			.onConflictDoUpdate({
				target: [
					tasks.organizationId,
					tasks.externalProvider,
					tasks.externalId,
				],
				set: {
					...buildConflictUpdateColumns(tasks, ["title", "lastSyncedAt"]),
					syncError: null,
				},
			});
	}

	return Response.json({
		success: true,
		mapped: mappedTasks.length,
		upserted: true,
	});
}
