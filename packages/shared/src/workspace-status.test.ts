import { describe, expect, test } from "bun:test";
import {
	DEFAULT_WORKSPACE_SURFACE_STATUS,
	deriveSurfaceStatus,
	highestPriorityStatus,
	isActiveSurfaceStatus,
	isTerminalSurfaceStatus,
	isWorkspaceSurfaceStatus,
	WORKSPACE_SURFACE_STATUSES,
	type WorkspaceSurfaceStatus,
} from "./workspace-status";

describe("isWorkspaceSurfaceStatus", () => {
	test("accepts every declared status", () => {
		for (const status of WORKSPACE_SURFACE_STATUSES) {
			expect(isWorkspaceSurfaceStatus(status)).toBe(true);
		}
	});

	test("rejects unknown / non-string values", () => {
		expect(isWorkspaceSurfaceStatus("running")).toBe(false);
		expect(isWorkspaceSurfaceStatus("")).toBe(false);
		expect(isWorkspaceSurfaceStatus(undefined)).toBe(false);
		expect(isWorkspaceSurfaceStatus(null)).toBe(false);
		expect(isWorkspaceSurfaceStatus(3)).toBe(false);
	});
});

describe("active / terminal classification", () => {
	test("live and connecting are active", () => {
		expect(isActiveSurfaceStatus("live")).toBe(true);
		expect(isActiveSurfaceStatus("connecting")).toBe(true);
	});

	test("idle/ended/error/unavailable are not active", () => {
		for (const status of [
			"idle",
			"ended",
			"error",
			"unavailable",
		] as WorkspaceSurfaceStatus[]) {
			expect(isActiveSurfaceStatus(status)).toBe(false);
		}
	});

	test("ended and error are terminal", () => {
		expect(isTerminalSurfaceStatus("ended")).toBe(true);
		expect(isTerminalSurfaceStatus("error")).toBe(true);
	});

	test("live/idle/connecting/unavailable are not terminal", () => {
		for (const status of [
			"live",
			"idle",
			"connecting",
			"unavailable",
		] as WorkspaceSurfaceStatus[]) {
			expect(isTerminalSurfaceStatus(status)).toBe(false);
		}
	});
});

describe("highestPriorityStatus", () => {
	test("empty input falls back to the default (unavailable)", () => {
		expect(highestPriorityStatus([])).toBe(DEFAULT_WORKSPACE_SURFACE_STATUS);
		expect(highestPriorityStatus([])).toBe("unavailable");
	});

	test("live dominates everything", () => {
		expect(highestPriorityStatus(["idle", "live", "error"])).toBe("live");
		expect(highestPriorityStatus(["unavailable", "connecting", "live"])).toBe(
			"live",
		);
	});

	test("connecting beats error/idle/ended but loses to live", () => {
		expect(highestPriorityStatus(["error", "connecting", "idle"])).toBe(
			"connecting",
		);
	});

	test("error beats idle and ended", () => {
		expect(highestPriorityStatus(["ended", "idle", "error"])).toBe("error");
	});

	test("any real signal beats unavailable", () => {
		expect(highestPriorityStatus(["unavailable", "ended"])).toBe("ended");
	});
});

describe("deriveSurfaceStatus", () => {
	test("ended/error are final regardless of host reachability", () => {
		expect(deriveSurfaceStatus({ lifecycle: "ended", hostOnline: false })).toBe(
			"ended",
		);
		expect(deriveSurfaceStatus({ lifecycle: "error", hostOnline: false })).toBe(
			"error",
		);
	});

	test("offline host hides live/idle/starting signal", () => {
		expect(
			deriveSurfaceStatus({ lifecycle: "running", hostOnline: false }),
		).toBe("unavailable");
		expect(deriveSurfaceStatus({ lifecycle: "idle", hostOnline: false })).toBe(
			"unavailable",
		);
		expect(
			deriveSurfaceStatus({ lifecycle: "starting", hostOnline: false }),
		).toBe("unavailable");
	});

	test("online host maps lifecycle to surface status", () => {
		expect(
			deriveSurfaceStatus({ lifecycle: "running", hostOnline: true }),
		).toBe("live");
		expect(deriveSurfaceStatus({ lifecycle: "idle", hostOnline: true })).toBe(
			"idle",
		);
		expect(
			deriveSurfaceStatus({ lifecycle: "starting", hostOnline: true }),
		).toBe("connecting");
	});

	test("isConnecting forces connecting even when row says running", () => {
		expect(
			deriveSurfaceStatus({
				lifecycle: "running",
				hostOnline: true,
				isConnecting: true,
			}),
		).toBe("connecting");
	});

	test("no row yet (host reachable/unknown) reads unavailable", () => {
		expect(deriveSurfaceStatus({ lifecycle: null })).toBe("unavailable");
		expect(
			deriveSurfaceStatus({ lifecycle: undefined, hostOnline: true }),
		).toBe("unavailable");
	});

	test("host reachability defaults to reachable when unknown", () => {
		// hostOnline omitted -> not treated as offline -> running reads live.
		expect(deriveSurfaceStatus({ lifecycle: "running" })).toBe("live");
	});
});
