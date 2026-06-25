import { describe, expect, it } from "bun:test";
import {
	DEFAULT_PERMISSION_MODE,
	isPermissionMode,
	type PermissionMode,
	permissionModeToHarnessState,
} from "./chat-permission-mode";

describe("chat-permission-mode", () => {
	it("defaults to the safe 'default' mode, never bypassPermissions", () => {
		expect(DEFAULT_PERMISSION_MODE).toBe("default");
	});

	it("narrows known modes and rejects everything else", () => {
		for (const mode of [
			"default",
			"acceptEdits",
			"bypassPermissions",
		] as const) {
			expect(isPermissionMode(mode)).toBe(true);
		}
		expect(isPermissionMode("yolo")).toBe(false);
		expect(isPermissionMode("")).toBe(false);
		expect(isPermissionMode(undefined)).toBe(false);
		expect(isPermissionMode(null)).toBe(false);
	});

	it("maps bypassPermissions to harness yolo with no category overrides", () => {
		expect(permissionModeToHarnessState("bypassPermissions")).toEqual({
			yolo: true,
			permissionRules: { categories: {}, tools: {} },
		});
	});

	it("maps acceptEdits to auto-allowed edits, no yolo", () => {
		expect(permissionModeToHarnessState("acceptEdits")).toEqual({
			yolo: false,
			permissionRules: { categories: { edit: "allow" }, tools: {} },
		});
	});

	it("maps default to no yolo and no category overrides (everything asks)", () => {
		expect(permissionModeToHarnessState("default")).toEqual({
			yolo: false,
			permissionRules: { categories: {}, tools: {} },
		});
	});

	it("always clears category grants so switching modes is not sticky", () => {
		// Switching away from acceptEdits must not leave the edit-allow in place.
		const afterDefault = permissionModeToHarnessState("default");
		expect(afterDefault.permissionRules.categories).toEqual({});

		const modes: PermissionMode[] = [
			"default",
			"acceptEdits",
			"bypassPermissions",
		];
		for (const mode of modes) {
			expect(permissionModeToHarnessState(mode).permissionRules.tools).toEqual(
				{},
			);
		}
	});
});
