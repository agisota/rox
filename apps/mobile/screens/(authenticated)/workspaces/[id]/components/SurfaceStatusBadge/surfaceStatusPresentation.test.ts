import { describe, expect, test } from "bun:test";
import {
	WORKSPACE_SURFACE_STATUSES,
	type WorkspaceSurfaceStatus,
} from "@rox/shared/workspace-status";
import { surfaceStatusPresentation } from "./surfaceStatusPresentation";

describe("surfaceStatusPresentation", () => {
	test("every status has a non-empty label", () => {
		for (const status of WORKSPACE_SURFACE_STATUSES) {
			expect(surfaceStatusPresentation(status).label.length > 0).toBe(true);
		}
	});

	test("only active statuses pulse", () => {
		expect(surfaceStatusPresentation("live").pulse).toBe(true);
		expect(surfaceStatusPresentation("connecting").pulse).toBe(true);
		for (const status of [
			"idle",
			"ended",
			"error",
			"unavailable",
		] as WorkspaceSurfaceStatus[]) {
			expect(surfaceStatusPresentation(status).pulse).toBe(false);
		}
	});

	test("error uses the destructive variant", () => {
		expect(surfaceStatusPresentation("error").variant).toBe("destructive");
	});

	test("live uses the primary (default) variant", () => {
		expect(surfaceStatusPresentation("live").variant).toBe("default");
	});

	test("labels are stable (snapshot of the contract)", () => {
		expect(surfaceStatusPresentation("live").label).toBe("Live");
		expect(surfaceStatusPresentation("connecting").label).toBe("Connecting");
		expect(surfaceStatusPresentation("idle").label).toBe("Idle");
		expect(surfaceStatusPresentation("ended").label).toBe("Ended");
		expect(surfaceStatusPresentation("error").label).toBe("Error");
		expect(surfaceStatusPresentation("unavailable").label).toBe("Unavailable");
	});
});
