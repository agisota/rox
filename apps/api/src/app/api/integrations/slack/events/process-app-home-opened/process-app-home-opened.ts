import { db } from "@rox/db/client";
import { integrationConnections, usersSlackUsers } from "@rox/db/schema";
import { isIntegrationSecretDecodeError } from "@rox/trpc/integration-secret";
import { and, desc, eq, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { generateConnectUrl } from "../utils/generate-connect-url";
import { createSlackClient } from "../utils/slack-client";
import { buildHomeView } from "./build-home-view";

interface ProcessAppHomeOpenedParams {
	event: { user: string; tab: string };
	teamId: string;
	eventId: string;
}

export async function processAppHomeOpened({
	event,
	teamId,
}: ProcessAppHomeOpenedParams): Promise<void> {
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
			"[slack/process-app-home-opened] No connection found for team:",
			teamId,
		);
		return;
	}

	const slackUserLink = await db.query.usersSlackUsers.findFirst({
		where: and(
			eq(usersSlackUsers.slackUserId, event.user),
			eq(usersSlackUsers.teamId, teamId),
		),
		with: { user: true },
	});

	const isUserLinked = !!slackUserLink;
	const userName = slackUserLink?.user?.name;

	const connectUrl = isUserLinked
		? undefined
		: generateConnectUrl({ slackUserId: event.user, teamId });

	let slack: ReturnType<typeof createSlackClient>;
	try {
		slack = createSlackClient(connection.accessToken);
	} catch (error) {
		if (isIntegrationSecretDecodeError(error)) {
			logger.error(
				"[slack/process-app-home-opened] Stored Slack token is unreadable",
				{
					connectionId: connection.id,
					teamId,
				},
			);
			return;
		}
		throw error;
	}

	await slack.views.publish({
		user_id: event.user,
		view: buildHomeView({
			modelPreference: slackUserLink?.modelPreference ?? undefined,
			externalOrgName: connection.externalOrgName ?? undefined,
			isUserLinked,
			userName: userName ?? undefined,
			connectUrl,
		}),
	});
}
