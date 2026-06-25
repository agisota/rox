import { describe, expect, test } from "bun:test";
import type { SelectDurableSession } from "@rox/db/schema";
import { selectClaudeSession } from "./selectClaudeSession";

function session(
	overrides: Partial<SelectDurableSession> = {},
): SelectDurableSession {
	return {
		id: "s1",
		organizationId: "org-1",
		workspaceId: "ws-1",
		hostId: "host-1",
		agent: "claude",
		status: "idle",
		title: null,
		lastActiveAt: null,
		createdAt: new Date("2026-06-01T00:00:00Z"),
		updatedAt: new Date("2026-06-01T00:00:00Z"),
		...overrides,
	};
}

describe("selectClaudeSession", () => {
	test("no rows + not connecting -> unavailable empty surface", () => {
		const surface = selectClaudeSession([], "ws-1");
		expect(surface).toEqual({
			status: "unavailable",
			title: null,
			lastActiveAt: null,
			id: null,
		});
	});

	test("no rows + connecting -> connecting", () => {
		expect(
			selectClaudeSession(undefined, "ws-1", { isConnecting: true }).status,
		).toBe("connecting");
	});

	test("ignores sessions from other workspaces", () => {
		const surface = selectClaudeSession(
			[session({ id: "other", workspaceId: "ws-2", status: "running" })],
			"ws-1",
		);
		expect(surface.status).toBe("unavailable");
		expect(surface.id).toBeNull();
	});

	test("running session on this workspace -> live", () => {
		const surface = selectClaudeSession(
			[session({ status: "running", title: "main" })],
			"ws-1",
		);
		expect(surface.status).toBe("live");
		expect(surface.title).toBe("main");
		expect(surface.id).toBe("s1");
	});

	test("picks newest by lastActiveAt over createdAt", () => {
		const older = session({
			id: "old",
			status: "ended",
			createdAt: new Date("2026-06-10T00:00:00Z"),
			lastActiveAt: new Date("2026-06-10T00:00:00Z"),
		});
		const newer = session({
			id: "new",
			status: "running",
			createdAt: new Date("2026-06-01T00:00:00Z"),
			lastActiveAt: new Date("2026-06-20T00:00:00Z"),
		});
		const surface = selectClaudeSession([older, newer], "ws-1");
		expect(surface.id).toBe("new");
		expect(surface.status).toBe("live");
	});

	test("ended session is final even when host offline", () => {
		const surface = selectClaudeSession(
			[session({ status: "ended" })],
			"ws-1",
			{ hostOnline: false },
		);
		expect(surface.status).toBe("ended");
	});

	test("offline host downgrades a running session to unavailable", () => {
		const surface = selectClaudeSession(
			[session({ status: "running" })],
			"ws-1",
			{ hostOnline: false },
		);
		expect(surface.status).toBe("unavailable");
	});

	test("connecting flag surfaces connecting over running row", () => {
		const surface = selectClaudeSession(
			[session({ status: "running" })],
			"ws-1",
			{ isConnecting: true },
		);
		expect(surface.status).toBe("connecting");
	});

	test("normalizes string timestamps from the wire", () => {
		const surface = selectClaudeSession(
			[
				session({
					status: "idle",
					lastActiveAt: "2026-06-15T12:00:00Z" as unknown as Date,
				}),
			],
			"ws-1",
		);
		expect(surface.lastActiveAt instanceof Date).toBe(true);
		expect(surface.lastActiveAt?.toISOString()).toBe(
			"2026-06-15T12:00:00.000Z",
		);
	});

	test("empty workspaceId yields unavailable (no crash)", () => {
		expect(selectClaudeSession([session()], "").status).toBe("unavailable");
	});
});
