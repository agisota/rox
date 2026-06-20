import { db } from "@rox/db/client";
import { integrationConnections, tasks } from "@rox/db/schema";
import { isIntegrationSecretDecodeError } from "@rox/trpc/integration-secret";
import type { EntityMetadata, LinkSharedEvent } from "@slack/types";
import { and, desc, eq, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { createSlackClient } from "../utils/slack-client";
import {
	createTaskWorkObject,
	parseTaskSlugFromUrl,
} from "../utils/work-objects";

interface ProcessLinkSharedParams {
	event: LinkSharedEvent;
	teamId: string;
	eventId: string;
}

export async function processLinkShared({
	event,
	teamId,
	eventId,
}: ProcessLinkSharedParams): Promise<void> {
	logger.info("[slack/process-link-shared] Processing links:", {
		eventId,
		teamId,
		linkCount: event.links.length,
	});

	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.provider, "slack"),
			eq(integrationConnections.externalOrgId, teamId),
			isNull(integrationConnections.disconnectedAt),
		),
		orderBy: [
			desc(integrationConnections.updatedAt),
			desc(integrationConnections.id),
		],
	});

	if (!connection) {
		logger.error(
			"[slack/process-link-shared] No connection found for team:",
			teamId,
		);
		return;
	}

	let slack: ReturnType<typeof createSlackClient>;
	try {
		slack = createSlackClient(connection.accessToken);
	} catch (error) {
		if (isIntegrationSecretDecodeError(error)) {
			logger.error(
				"[slack/process-link-shared] Stored Slack token is unreadable",
				{
					connectionId: connection.id,
					teamId,
				},
			);
			return;
		}
		throw error;
	}

	const entities: EntityMetadata[] = [];

	for (const link of event.links) {
		const taskSlug = parseTaskSlugFromUrl(link.url);
		if (!taskSlug) {
			continue;
		}

		const task = await db.query.tasks.findFirst({
			where: and(
				eq(tasks.organizationId, connection.organizationId),
				eq(tasks.slug, taskSlug),
			),
			with: {
				status: true,
				assignee: true,
				creator: true,
			},
		});

		if (task) {
			const entity = createTaskWorkObject(task);
			// Must match the exact URL from the message for Slack to unfurl
			entity.app_unfurl_url = link.url;
			entities.push(entity);
		}
	}

	if (entities.length > 0) {
		try {
			// Work Objects use `metadata` instead of the legacy `unfurls` field
			await slack.chat.unfurl({
				channel: event.channel,
				ts: event.message_ts,
				metadata: {
					entities,
				},
			});
		} catch (err) {
			logger.error("[slack/process-link-shared] Failed to send unfurls:", err);
		}
	}
}
