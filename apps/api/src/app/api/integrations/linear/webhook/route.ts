import {
	LINEAR_WEBHOOK_SIGNATURE_HEADER,
	LinearWebhookClient,
} from "@linear/sdk/webhooks";
import { db } from "@rox/db/client";
import type { SelectIntegrationConnection } from "@rox/db/schema";
import {
	integrationConnections,
	members,
	taskStatuses,
	tasks,
	users,
	webhookEvents,
} from "@rox/db/schema";
import { mapPriorityFromLinear } from "@rox/trpc/integrations/linear";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const webhookClient = new LinearWebhookClient(env.LINEAR_WEBHOOK_SECRET);

/**
 * Shape of an Issue webhook's `data` field that `processIssueEvent` actually
 * reads. Linear adds fields freely and many are optional/nullable, so the
 * schema is intentionally permissive (`.passthrough()`, generous optionals) and
 * only asserts the fields we depend on before writing to the DB. This replaces
 * the previous unchecked `as EntityWebhookPayloadWithIssueData` cast.
 */
const linearIssueDataSchema = z
	.object({
		id: z.string(),
		identifier: z.string(),
		title: z.string(),
		description: z.string().nullish(),
		url: z.string(),
		createdAt: z.union([z.string(), z.date()]),
		priority: z.number(),
		estimate: z.number().nullish(),
		dueDate: z.union([z.string(), z.date()]).nullish(),
		startedAt: z.union([z.string(), z.date()]).nullish(),
		completedAt: z.union([z.string(), z.date()]).nullish(),
		state: z.object({ id: z.string() }).passthrough(),
		assignee: z
			.object({
				id: z.string(),
				email: z.string().nullish(),
				name: z.string().nullish(),
				avatarUrl: z.string().nullish(),
			})
			.passthrough()
			.nullish(),
		labels: z.array(z.object({ name: z.string() }).passthrough()).default([]),
	})
	.passthrough();

type LinearIssueData = z.infer<typeof linearIssueDataSchema>;

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get(LINEAR_WEBHOOK_SIGNATURE_HEADER);

	if (!signature) {
		return apiError("Missing signature", 401);
	}

	const payload = webhookClient.parseData(Buffer.from(body), signature);

	if (!payload.type) {
		logger.error("[linear/webhook] Missing event type");
		return apiError("Missing event type", 400);
	}

	const connections = await db.query.integrationConnections.findMany({
		where: and(
			eq(integrationConnections.externalOrgId, payload.organizationId),
			eq(integrationConnections.provider, "linear"),
			isNull(integrationConnections.disconnectedAt),
		),
		orderBy: [asc(integrationConnections.id)],
	});

	if (connections.length === 0) {
		logger.info(
			"[linear/webhook] No active connections for Linear org:",
			payload.organizationId,
		);
		return Response.json({ success: true, status: "no_subscribers" });
	}

	const results = await Promise.all(
		connections.map((connection) =>
			processForConnection(payload, connection).catch((error) => ({
				connectionId: connection.id,
				outcome: "failed" as const,
				error: error instanceof Error ? error.message : "Unknown error",
			})),
		),
	);

	const anyFailed = results.some((r) => r.outcome === "failed");
	const allFailed = results.every((r) => r.outcome === "failed");
	if (anyFailed) {
		logger.error("[linear/webhook] processing failures:", results);
	}
	return Response.json(
		{
			success: !allFailed,
			status: allFailed
				? "failed"
				: anyFailed
					? "partial_failure"
					: "processed",
		},
		{ status: allFailed ? 500 : 200 },
	);
}

async function processForConnection(
	payload: ReturnType<LinearWebhookClient["parseData"]>,
	connection: SelectIntegrationConnection,
): Promise<{
	connectionId: string;
	outcome: "processed" | "skipped" | "failed";
	error?: string;
}> {
	// One webhookEvents row per (Linear event × Rox connection) so each
	// tenant's processing status is independently retryable.
	const eventId = `${connection.id}-${payload.organizationId}-${payload.webhookTimestamp}`;

	const [webhookEvent] = await db
		.insert(webhookEvents)
		.values({
			provider: "linear",
			eventId,
			eventType: `${payload.type}.${payload.action}`,
			payload,
			status: "pending",
		})
		.onConflictDoUpdate({
			target: [webhookEvents.provider, webhookEvents.eventId],
			set: {
				status: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN 'pending' ELSE ${webhookEvents.status} END`,
				retryCount: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN ${webhookEvents.retryCount} + 1 ELSE ${webhookEvents.retryCount} END`,
				error: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN NULL ELSE ${webhookEvents.error} END`,
			},
		})
		.returning();

	if (!webhookEvent) {
		return {
			connectionId: connection.id,
			outcome: "failed",
			error: "Failed to store event",
		};
	}

	if (webhookEvent.status === "processed") {
		return { connectionId: connection.id, outcome: "processed" };
	}
	if (webhookEvent.status !== "pending") {
		return { connectionId: connection.id, outcome: "skipped" };
	}

	try {
		let outcome: "processed" | "skipped" = "processed";

		if (payload.type === "Issue") {
			const parsedIssue = linearIssueDataSchema.safeParse(payload.data);
			if (!parsedIssue.success) {
				logger.error(
					"[linear/webhook] Malformed Issue payload, skipping",
					parsedIssue.error.issues,
				);
				outcome = "skipped";
			} else {
				outcome = await processIssueEvent(
					payload.action,
					parsedIssue.data,
					connection,
				);
			}
		}

		await db
			.update(webhookEvents)
			.set({ status: outcome, processedAt: new Date() })
			.where(eq(webhookEvents.id, webhookEvent.id));

		return { connectionId: connection.id, outcome };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await db
			.update(webhookEvents)
			.set({
				status: "failed",
				error: message,
				retryCount: webhookEvent.retryCount + 1,
			})
			.where(eq(webhookEvents.id, webhookEvent.id));

		return { connectionId: connection.id, outcome: "failed", error: message };
	}
}

async function processIssueEvent(
	action: string,
	issue: LinearIssueData,
	connection: SelectIntegrationConnection,
): Promise<"processed" | "skipped"> {
	if (action === "create" || action === "update") {
		const taskStatus = await db.query.taskStatuses.findFirst({
			where: and(
				eq(taskStatuses.organizationId, connection.organizationId),
				eq(taskStatuses.externalProvider, "linear"),
				eq(taskStatuses.externalId, issue.state.id),
			),
		});

		if (!taskStatus) {
			// TODO(SUPER-237): Handle new workflow states in webhooks by triggering syncWorkflowStates
			// Currently webhooks silently fail when Linear has new statuses that aren't synced yet.
			// Should either: (1) trigger workflow state sync and retry, (2) queue for retry, or (3) keep periodic sync only
			logger.warn(
				`[webhook] Status not found for state ${issue.state.id}, skipping update`,
			);
			return "skipped";
		}

		let assigneeId: string | null = null;
		if (issue.assignee?.email) {
			const matchedMember = await db
				.select({ userId: users.id })
				.from(users)
				.innerJoin(members, eq(members.userId, users.id))
				.where(
					and(
						eq(users.email, issue.assignee.email),
						eq(members.organizationId, connection.organizationId),
					),
				)
				.limit(1)
				.then((rows) => rows[0]);
			assigneeId = matchedMember?.userId ?? null;
		}

		let assigneeExternalId: string | null = null;
		let assigneeDisplayName: string | null = null;
		let assigneeAvatarUrl: string | null = null;

		if (issue.assignee && !assigneeId) {
			assigneeExternalId = issue.assignee.id;
			assigneeDisplayName = issue.assignee.name ?? null;
			assigneeAvatarUrl = issue.assignee.avatarUrl ?? null;
		}

		const taskData = {
			slug: issue.identifier,
			title: issue.title,
			description: issue.description ?? null,
			statusId: taskStatus.id,
			priority: mapPriorityFromLinear(issue.priority),
			assigneeId,
			assigneeExternalId,
			assigneeDisplayName,
			assigneeAvatarUrl,
			estimate: issue.estimate ?? null,
			dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
			labels: issue.labels.map((l) => l.name),
			startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
			completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
			externalProvider: "linear" as const,
			externalId: issue.id,
			externalKey: issue.identifier,
			externalUrl: issue.url,
			lastSyncedAt: new Date(),
		};

		await db
			.insert(tasks)
			.values({
				...taskData,
				organizationId: connection.organizationId,
				creatorId: connection.connectedByUserId,
				createdAt: new Date(issue.createdAt),
			})
			.onConflictDoUpdate({
				target: [
					tasks.organizationId,
					tasks.externalProvider,
					tasks.externalId,
				],
				set: { ...taskData, syncError: null },
			});
	} else if (action === "remove") {
		await db
			.update(tasks)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(tasks.organizationId, connection.organizationId),
					eq(tasks.externalProvider, "linear"),
					eq(tasks.externalId, issue.id),
				),
			);
	}

	return "processed";
}
