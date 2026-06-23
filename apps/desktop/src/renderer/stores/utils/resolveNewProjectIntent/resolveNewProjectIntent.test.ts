import { describe, expect, it } from "bun:test";
import { resolveNewProjectIntent } from "./resolveNewProjectIntent";

describe("resolveNewProjectIntent", () => {
	it("navigates to the main-workspace when intent is open and id exists", () => {
		expect(resolveNewProjectIntent("open", "ws_123")).toEqual({
			kind: "navigate-workspace",
			workspaceId: "ws_123",
		});
	});

	it("does nothing when intent is open but there is no main-workspace", () => {
		expect(resolveNewProjectIntent("open", null)).toEqual({ kind: "none" });
	});

	it("does nothing when intent is return-id even if an id exists", () => {
		expect(resolveNewProjectIntent("return-id", "ws_123")).toEqual({
			kind: "none",
		});
	});

	it("does nothing for return-id with no id", () => {
		expect(resolveNewProjectIntent("return-id", null)).toEqual({
			kind: "none",
		});
	});
});
