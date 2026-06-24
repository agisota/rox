import { beforeEach, describe, expect, it } from "bun:test";
import { usePermissionModePreferenceStore } from "./store";

describe("usePermissionModePreferenceStore", () => {
	beforeEach(() => {
		// Reset to the safe default between cases.
		usePermissionModePreferenceStore.setState({ permissionMode: "default" });
	});

	it("defaults to the safer 'default' (manual-confirm) mode, not bypassPermissions", () => {
		expect(usePermissionModePreferenceStore.getState().permissionMode).toBe(
			"default",
		);
	});

	it("persists an explicit mode change", () => {
		usePermissionModePreferenceStore
			.getState()
			.setPermissionMode("acceptEdits");
		expect(usePermissionModePreferenceStore.getState().permissionMode).toBe(
			"acceptEdits",
		);

		usePermissionModePreferenceStore
			.getState()
			.setPermissionMode("bypassPermissions");
		expect(usePermissionModePreferenceStore.getState().permissionMode).toBe(
			"bypassPermissions",
		);
	});

	it("exposes a stable setter identity across reads", () => {
		const first = usePermissionModePreferenceStore.getState().setPermissionMode;
		const second =
			usePermissionModePreferenceStore.getState().setPermissionMode;
		expect(first).toBe(second);
	});
});
