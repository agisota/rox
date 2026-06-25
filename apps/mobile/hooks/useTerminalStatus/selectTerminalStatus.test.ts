import { describe, expect, test } from "bun:test";
import type { SelectTerminal } from "@rox/db/schema";
import { selectTerminalStatus } from "./selectTerminalStatus";

function terminal(overrides: Partial<SelectTerminal> = {}): SelectTerminal {
	return {
		id: "t1",
		organizationId: "org-1",
		workspaceId: "ws-1",
		hostId: "host-1",
		title: null,
		status: "idle",
		exitCode: null,
		lastActiveAt: null,
		createdAt: new Date("2026-06-01T00:00:00Z"),
		updatedAt: new Date("2026-06-01T00:00:00Z"),
		...overrides,
	};
}

describe("selectTerminalStatus", () => {
	test("no rows + not connecting -> unavailable empty surface", () => {
		expect(selectTerminalStatus([], "ws-1")).toEqual({
			status: "unavailable",
			title: null,
			lastActiveAt: null,
			id: null,
		});
	});

	test("no rows + connecting -> connecting", () => {
		expect(
			selectTerminalStatus(undefined, "ws-1", { isConnecting: true }).status,
		).toBe("connecting");
	});

	test("running terminal on this workspace -> live", () => {
		const surface = selectTerminalStatus(
			[terminal({ status: "running", title: "zsh" })],
			"ws-1",
		);
		expect(surface.status).toBe("live");
		expect(surface.title).toBe("zsh");
		expect(surface.id).toBe("t1");
	});

	test("ignores terminals from other workspaces", () => {
		const surface = selectTerminalStatus(
			[terminal({ workspaceId: "ws-2", status: "running" })],
			"ws-1",
		);
		expect(surface.status).toBe("unavailable");
	});

	test("error terminal is final even when host offline", () => {
		const surface = selectTerminalStatus(
			[terminal({ status: "error", exitCode: 137 })],
			"ws-1",
			{ hostOnline: false },
		);
		expect(surface.status).toBe("error");
	});

	test("offline host downgrades a running terminal to unavailable", () => {
		const surface = selectTerminalStatus(
			[terminal({ status: "running" })],
			"ws-1",
			{ hostOnline: false },
		);
		expect(surface.status).toBe("unavailable");
	});

	test("picks newest by lastActiveAt", () => {
		const a = terminal({
			id: "a",
			status: "ended",
			lastActiveAt: new Date("2026-06-05T00:00:00Z"),
		});
		const b = terminal({
			id: "b",
			status: "running",
			lastActiveAt: new Date("2026-06-25T00:00:00Z"),
		});
		expect(selectTerminalStatus([a, b], "ws-1").id).toBe("b");
		expect(selectTerminalStatus([a, b], "ws-1").status).toBe("live");
	});
});
