"use client";

import type { HostClient } from "@rox/shared/host-client";
import { useEffect, useState } from "react";
import type { MockDiffFile, MockMessage } from "../../../../../mock-data";
import {
	mapHostChatMessages,
	mapHostGitStatusToDiffFiles,
} from "../../utils/liveSession";

export type LiveSessionTarget = {
	client: HostClient;
	workspaceId: string;
	/** Host chat/session id whose transcript backs the live chat pane. */
	sessionId: string;
};

export type LiveSessionState = {
	diffFiles: MockDiffFile[];
	messages: MockMessage[];
	loading: boolean;
	error: string | null;
};

function getErrorMessage(caught: unknown): string {
	return caught instanceof Error ? caught.message : String(caught);
}

/**
 * Read host-scoped live session data (git status + chat transcript) through the
 * attached {@link HostClient} (WS-B T5, D6 read plane A — the host is the single
 * source of truth). Terminal frames stream separately via `WebTerminal`; this
 * hook backs the diff + chat panes. Errors are surfaced (not swallowed) so the
 * cabinet can show an attach failure rather than silently empty panels.
 */
export function useLiveSession(
	target: LiveSessionTarget | null,
): LiveSessionState {
	const [diffFiles, setDiffFiles] = useState<MockDiffFile[]>([]);
	const [messages, setMessages] = useState<MockMessage[]>([]);
	const [loading, setLoading] = useState<boolean>(target !== null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!target) {
			setLoading(false);
			return;
		}
		let cancelled = false;
		setLoading(true);
		setError(null);
		(async () => {
			const [gitResult, chatResult] = await Promise.allSettled([
				target.client.git.getStatus(target.workspaceId),
				target.client.chat.listMessages(target.sessionId),
			]);
			if (cancelled) return;
			if (gitResult.status === "fulfilled") {
				setDiffFiles(mapHostGitStatusToDiffFiles(gitResult.value));
			} else {
				setError(getErrorMessage(gitResult.reason));
			}
			if (chatResult.status === "fulfilled") {
				setMessages(mapHostChatMessages(chatResult.value.messages));
			} else {
				setError((prev) => prev ?? getErrorMessage(chatResult.reason));
			}
			setLoading(false);
		})();
		return () => {
			cancelled = true;
		};
	}, [target]);

	return { diffFiles, messages, loading, error };
}
