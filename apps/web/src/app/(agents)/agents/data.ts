import "server-only";

import { api } from "@/trpc/server";

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
