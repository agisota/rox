import "server-only";

import { api } from "@/trpc/server";

import {
	type AgentsHostTarget,
	resolveAgentsHostListing,
} from "./resolveAgentsHostListing";
import {
	buildSessionDashboardDetail,
	buildSessionDashboardSummary,
	type SessionDashboardDetail,
	type SessionDashboardSummary,
	type SessionDashboardUsageRow,
} from "./session-dashboard";

export type AgentsDashboardData = {
	sessions: SessionDashboardSummary[];
	totals: {
		totalTokens: number;
		llmCalls: number;
		toolCalls: number;
		activeSessions: number;
	};
};

type UsageRowWithSession = SessionDashboardUsageRow & {
	chatSessionId: string | null;
};

export async function loadAgentsDashboardData(): Promise<AgentsDashboardData> {
	const trpc = await api();
	const payload = await trpc.chat.listSessions.query();
	const usageBySession = groupUsageBySession(payload.usageRequests);
	const sessions = payload.sessions.map((session) =>
		buildSessionDashboardSummary(session, usageBySession.get(session.id) ?? []),
	);

	return {
		sessions,
		totals: {
			totalTokens: sessions.reduce(
				(total, session) => total + session.totalTokens,
				0,
			),
			llmCalls: sessions.reduce(
				(total, session) => total + session.llmCalls,
				0,
			),
			toolCalls: sessions.reduce(
				(total, session) => total + session.toolCalls,
				0,
			),
			activeSessions: sessions.length,
		},
	};
}

export type AgentsHostListing = {
	targets: AgentsHostTarget[];
	useMock: boolean;
};

/**
 * Real host/workspace listing for the cabinet (WS-B T3). Reads `host.list` for
 * the active org and maps it through {@link resolveAgentsHostListing}, so the
 * cabinet can bind to a real attached host (D6 read plane A) instead of mock
 * data. Falls back to the mock prototype ONLY when the org has no hosts at all
 * (the mock module is kept, never deleted). Returns the mock fallback if there
 * is no active organization.
 */
export async function loadAgentsHostTargets(): Promise<AgentsHostListing> {
	const trpc = await api();
	const organization = await trpc.organization.getActive.query();
	if (!organization) {
		return { targets: [], useMock: true };
	}
	const hosts = await trpc.host.list.query({
		organizationId: organization.id,
	});
	return resolveAgentsHostListing(
		organization.id,
		hosts.map((host) => ({
			id: host.id,
			name: host.name,
			online: host.online,
			kind: host.kind,
		})),
	);
}

export async function loadAgentsSessionDetail({
	sessionId,
}: {
	sessionId: string;
}): Promise<SessionDashboardDetail | null> {
	const trpc = await api();
	const payload = await trpc.chat.getSessionDetail.query({ sessionId });

	if (!payload) {
		return null;
	}

	return buildSessionDashboardDetail(payload.session, payload.usageRequests);
}

function groupUsageBySession(rows: UsageRowWithSession[]) {
	const usageBySession = new Map<string, SessionDashboardUsageRow[]>();

	for (const row of rows) {
		if (!row.chatSessionId) {
			continue;
		}

		const existing = usageBySession.get(row.chatSessionId) ?? [];
		existing.push(row);
		usageBySession.set(row.chatSessionId, existing);
	}

	return usageBySession;
}
