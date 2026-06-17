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
import { SessionTabs, type SessionView } from "../SessionTabs";

type SessionPageContentProps = {
	diffFiles: MockDiffFile[];
	messages: MockMessage[];
	session: MockSession;
};

/** Views that are part of the conversation and keep the follow-up input. */
const conversationalViews: SessionView[] = ["chat", "map", "flow", "atlas"];

export function SessionPageContent({
	diffFiles,
	messages,
	session,
}: SessionPageContentProps) {
	const [activeView, setActiveView] = useState<SessionView>("chat");

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<SessionHeader backHref="/agents" session={session} />
			<SessionTabs activeView={activeView} onViewChange={setActiveView} />
			<div
				role="tabpanel"
				id={`session-panel-${activeView}`}
				aria-labelledby={`session-tab-${activeView}`}
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
