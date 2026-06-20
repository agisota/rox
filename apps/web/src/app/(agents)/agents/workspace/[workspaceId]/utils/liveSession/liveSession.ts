import type { HostChatMessage, HostGitStatus } from "@rox/shared/host-client";
import type { MockDiffFile, MockMessage } from "../../../../../mock-data";

/**
 * Map a live host git status (`HostClient.git.getStatus`) into the cabinet's
 * diff-file view shape (WS-B T5). The cabinet's `SessionDiff`/`SessionChat`
 * render `MockDiffFile`-shaped rows; the host reports changed paths via
 * {@link HostGitStatus}. Until per-file before/after blobs stream over the
 * relay, we surface each changed path as a header-only diff entry (empty
 * old/new) so the panel lists the real working-tree changes from the attached
 * host (D6: host is the single source of truth) instead of fabricated mock
 * data. `path`/`status` come straight from the host.
 */
export function mapHostGitStatusToDiffFiles(
	status: HostGitStatus,
): MockDiffFile[] {
	return status.files.map((file) => ({
		filePath: file.path,
		oldString: "",
		newString: "",
	}));
}

/**
 * Map live host chat messages (`HostClient.chat.listMessages`) into the
 * cabinet's `MockMessage` view shape (WS-B T5). The cabinet only renders
 * `user`/`assistant` bubbles, so `system` messages are dropped. `createdAt` is
 * parsed from the host's ISO string into a `Date` the UI formats.
 */
export function mapHostChatMessages(
	messages: HostChatMessage[],
): MockMessage[] {
	const result: MockMessage[] = [];
	for (const message of messages) {
		if (message.role === "system") continue;
		result.push({
			id: message.id,
			role: message.role,
			content: message.content,
			createdAt: new Date(message.createdAt),
		});
	}
	return result;
}
