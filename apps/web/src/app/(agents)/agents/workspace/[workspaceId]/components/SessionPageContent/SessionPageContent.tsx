"use client";

import { useState } from "react";
import type {
	MockDiffFile,
	MockMessage,
	MockSession,
} from "../../../../../mock-data";
import { FollowUpInput } from "../FollowUpInput";
import { SessionAtlas } from "../SessionAtlas";
import { SessionChat } from "../SessionChat";
import { SessionDiff } from "../SessionDiff";
import { SessionFlow } from "../SessionFlow";
import { SessionHeader } from "../SessionHeader";
import { SessionMap } from "../SessionMap";
import { panelId, SessionTabs, type SessionView, tabId } from "../SessionTabs";

type SessionPageContentProps = {
	diffFiles: MockDiffFile[];
	messages: MockMessage[];
	session: MockSession;
	/** Workspace id used to scope the live presence room (WS-L T10). */
	workspaceId: string;
};

/** Views that are part of the conversation and keep the follow-up input. */
const conversationalViews: SessionView[] = ["chat", "map", "flow", "atlas"];

export function SessionPageContent({
	diffFiles,
	messages,
	session,
	workspaceId,
}: SessionPageContentProps) {
	const [activeView, setActiveView] = useState<SessionView>("chat");

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<SessionHeader
				backHref="/agents"
				dashboardId={workspaceId}
				session={session}
			/>
			<SessionTabs activeView={activeView} onViewChange={setActiveView} />
			<div
				role="tabpanel"
				id={panelId(activeView)}
				aria-labelledby={tabId(activeView)}
				className="flex-1 overflow-hidden"
			>
				{activeView === "chat" && (
					<SessionChat diffFiles={diffFiles} messages={messages} />
				)}
				{activeView === "map" && <SessionMap />}
				{activeView === "flow" && <SessionFlow />}
				{activeView === "atlas" && <SessionAtlas />}
				{activeView === "diff" && <SessionDiff diffFiles={diffFiles} />}
			</div>
			{conversationalViews.includes(activeView) && (
				<FollowUpInput modelName={session.modelName} />
			)}
		</div>
	);
}
