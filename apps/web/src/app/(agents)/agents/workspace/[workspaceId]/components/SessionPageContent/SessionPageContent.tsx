"use client";

import { useMemo, useState } from "react";
import { createRelayHostClient } from "../../../../../../../trpc/host-client";
import { WebTerminal } from "../../../../../../workspaces/[workspaceId]/components/WebTerminal";
import type {
	MockDiffFile,
	MockMessage,
	MockSession,
} from "../../../../../mock-data";
import { useLiveSession } from "../../hooks/useLiveSession";
import { FollowUpInput } from "../FollowUpInput";
import { OpenInDesktopButton } from "../OpenInDesktopButton";
import { SessionAtlas } from "../SessionAtlas";
import { SessionChat } from "../SessionChat";
import { SessionDiff } from "../SessionDiff";
import { SessionFlow } from "../SessionFlow";
import { SessionHeader } from "../SessionHeader";
import { SessionMap } from "../SessionMap";
import { panelId, SessionTabs, type SessionView, tabId } from "../SessionTabs";

/**
 * Descriptor for binding this cabinet session to a REAL attached host (WS-B
 * T5). When present, diff + chat panes read live host data over the relay
 * `HostClient` and a live terminal is mounted; the mock props are the
 * cache-first fallback shown until live data resolves. When `undefined`, the
 * page renders the pure mock prototype (unchanged behaviour).
 */
export type LiveHostBinding = {
	routingKey: string;
	workspaceId: string;
	/** Host chat/session id whose transcript backs the live chat pane. */
	sessionId: string;
	/** Live PTY session id to mount, if one already exists on the host. */
	terminalId: string | null;
};

type SessionPageContentProps = {
	diffFiles: MockDiffFile[];
	messages: MockMessage[];
	session: MockSession;
	/** Workspace id used to scope the live presence room (WS-L T10). */
	workspaceId: string;
	liveHost?: LiveHostBinding;
};

/** Views that are part of the conversation and keep the follow-up input. */
const conversationalViews: SessionView[] = ["chat", "map", "flow", "atlas"];

export function SessionPageContent({
	diffFiles,
	messages,
	session,
	workspaceId,
	liveHost,
}: SessionPageContentProps) {
	const [activeView, setActiveView] = useState<SessionView>("chat");

	// D6 read plane A: when bound to a real host, read git/chat THROUGH it.
	const liveClient = useMemo(
		() => (liveHost ? createRelayHostClient(liveHost.routingKey) : null),
		[liveHost],
	);
	const live = useLiveSession(
		liveHost && liveClient
			? {
					client: liveClient,
					workspaceId: liveHost.workspaceId,
					sessionId: liveHost.sessionId,
				}
			: null,
	);

	// Cache-first: keep the seeded rows visible until live data arrives, then
	// switch to the host's truth. Never blank existing rows on a transient load.
	const effectiveDiffFiles =
		liveHost && live.diffFiles.length > 0 ? live.diffFiles : diffFiles;
	const effectiveMessages =
		liveHost && live.messages.length > 0 ? live.messages : messages;

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<SessionHeader
				backHref="/agents"
				dashboardId={workspaceId}
				session={session}
			/>
			{liveHost && (
				<div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
					<span className="text-xs text-muted-foreground">
						{live.error
							? `Хост недоступен: ${live.error}`
							: live.loading
								? "Подключение к хосту…"
								: "Подключено к хосту"}
					</span>
					<OpenInDesktopButton
						workspaceId={liveHost.workspaceId}
						routingKey={liveHost.routingKey}
					/>
				</div>
			)}
			<SessionTabs activeView={activeView} onViewChange={setActiveView} />
			<div
				role="tabpanel"
				id={panelId(activeView)}
				aria-labelledby={tabId(activeView)}
				className="flex-1 overflow-hidden"
			>
				{activeView === "chat" && (
					<SessionChat
						diffFiles={effectiveDiffFiles}
						messages={effectiveMessages}
					/>
				)}
				{activeView === "map" && <SessionMap />}
				{activeView === "flow" && <SessionFlow />}
				{activeView === "atlas" &&
					(liveHost?.terminalId ? (
						<WebTerminal
							workspaceId={liveHost.workspaceId}
							terminalId={liveHost.terminalId}
							routingKey={liveHost.routingKey}
						/>
					) : (
						<SessionAtlas />
					))}
				{activeView === "diff" && (
					<SessionDiff diffFiles={effectiveDiffFiles} />
				)}
			</div>
			{conversationalViews.includes(activeView) && (
				<FollowUpInput modelName={session.modelName} />
			)}
		</div>
	);
}
