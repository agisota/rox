import { describe, expect, it } from "bun:test";
import type { HostChatMessage, HostGitStatus } from "@rox/shared/host-client";
import {
	mapHostChatMessages,
	mapHostGitStatusToDiffFiles,
} from "./liveSession";

describe("mapHostGitStatusToDiffFiles", () => {
	it("maps each changed host path to a diff-file row", () => {
		const status: HostGitStatus = {
			branch: "main",
			files: [
				{ path: "src/a.ts", status: "modified", staged: false },
				{ path: "src/b.ts", status: "added", staged: true },
			],
		};
		expect(mapHostGitStatusToDiffFiles(status)).toEqual([
			{ filePath: "src/a.ts", oldString: "", newString: "" },
			{ filePath: "src/b.ts", oldString: "", newString: "" },
		]);
	});

	it("returns an empty list for a clean working tree", () => {
		expect(mapHostGitStatusToDiffFiles({ branch: "main", files: [] })).toEqual(
			[],
		);
	});
});

describe("mapHostChatMessages", () => {
	it("keeps user/assistant messages and parses createdAt into a Date", () => {
		const messages: HostChatMessage[] = [
			{
				id: "m1",
				role: "user",
				content: "hi",
				createdAt: "2026-06-20T10:00:00.000Z",
			},
			{
				id: "m2",
				role: "assistant",
				content: "hello",
				createdAt: "2026-06-20T10:00:01.000Z",
			},
		];
		const mapped = mapHostChatMessages(messages);
		expect(mapped).toHaveLength(2);
		expect(mapped[0]).toMatchObject({ id: "m1", role: "user", content: "hi" });
		expect(mapped[0]?.createdAt).toBeInstanceOf(Date);
		expect(mapped[0]?.createdAt.toISOString()).toBe("2026-06-20T10:00:00.000Z");
	});

	it("drops system messages the cabinet cannot render", () => {
		const messages: HostChatMessage[] = [
			{
				id: "s1",
				role: "system",
				content: "boot",
				createdAt: "2026-06-20T09:59:00.000Z",
			},
			{
				id: "u1",
				role: "user",
				content: "go",
				createdAt: "2026-06-20T10:00:00.000Z",
			},
		];
		const mapped = mapHostChatMessages(messages);
		expect(mapped).toHaveLength(1);
		expect(mapped[0]?.role).toBe("user");
	});
});
