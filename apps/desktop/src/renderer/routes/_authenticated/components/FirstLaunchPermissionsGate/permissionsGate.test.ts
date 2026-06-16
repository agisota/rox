import { describe, expect, it } from "bun:test";
import {
	GATING_PERMISSION_KEYS,
	hasMissingGatingPermission,
	PERMISSION_GATE_ITEMS,
	type PermissionStatus,
	shouldShowPermissionsGate,
} from "./permissionsGate";

const ALL_GRANTED: PermissionStatus = {
	fullDiskAccess: true,
	accessibility: true,
	microphone: true,
};

describe("hasMissingGatingPermission", () => {
	it("returns false when status is undefined (still loading)", () => {
		expect(hasMissingGatingPermission(undefined)).toBe(false);
	});

	it("returns false when all gating permissions are granted", () => {
		expect(hasMissingGatingPermission(ALL_GRANTED)).toBe(false);
	});

	it("returns true when any gating permission is missing", () => {
		for (const key of GATING_PERMISSION_KEYS) {
			expect(hasMissingGatingPermission({ ...ALL_GRANTED, [key]: false })).toBe(
				true,
			);
		}
	});
});

describe("shouldShowPermissionsGate", () => {
	it("never shows on non-darwin platforms", () => {
		expect(
			shouldShowPermissionsGate({
				platform: "win32",
				status: {
					fullDiskAccess: false,
					accessibility: false,
					microphone: false,
				},
				dismissed: false,
			}),
		).toBe(false);
		expect(
			shouldShowPermissionsGate({
				platform: "linux",
				status: {
					fullDiskAccess: false,
					accessibility: false,
					microphone: false,
				},
				dismissed: false,
			}),
		).toBe(false);
	});

	it("shows on darwin when a permission is missing and not dismissed", () => {
		expect(
			shouldShowPermissionsGate({
				platform: "darwin",
				status: { ...ALL_GRANTED, accessibility: false },
				dismissed: false,
			}),
		).toBe(true);
	});

	it("does not show when the user has dismissed it", () => {
		expect(
			shouldShowPermissionsGate({
				platform: "darwin",
				status: { ...ALL_GRANTED, accessibility: false },
				dismissed: true,
			}),
		).toBe(false);
	});

	it("self-resolves: does not show once all permissions are granted", () => {
		expect(
			shouldShowPermissionsGate({
				platform: "darwin",
				status: ALL_GRANTED,
				dismissed: false,
			}),
		).toBe(false);
	});

	it("does not show while status is still loading (undefined)", () => {
		expect(
			shouldShowPermissionsGate({
				platform: "darwin",
				status: undefined,
				dismissed: false,
			}),
		).toBe(false);
	});
});

describe("PERMISSION_GATE_ITEMS", () => {
	it("mirrors the five Разрешения rows in order", () => {
		expect(PERMISSION_GATE_ITEMS.map((item) => item.id)).toEqual([
			"full-disk-access",
			"accessibility",
			"microphone",
			"automation",
			"local-network",
		]);
	});

	it("only the detectable rows carry a statusKey", () => {
		const withStatus = PERMISSION_GATE_ITEMS.filter(
			(item) => item.statusKey,
		).map((item) => item.statusKey);
		expect(withStatus).toEqual([
			"fullDiskAccess",
			"accessibility",
			"microphone",
		]);
	});

	it("every row has a request mutation", () => {
		for (const item of PERMISSION_GATE_ITEMS) {
			expect(item.requestKey).toBeTruthy();
		}
	});
});
