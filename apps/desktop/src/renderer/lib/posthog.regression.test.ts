import { describe, expect, test } from "bun:test";

// Regression guard for the PostHog anon→identified stitching fix (#5207) and
// the desktop_version super-property revert (#5164). A prior "fork-wins"
// upstream-sync merge silently resurrected the pre-fix code (device-id
// bootstrap + reactive reset()), reintroducing the ~77%→~4% stitching crash.
// This test fails loudly if any of it comes back.
//
// Uses Bun.file instead of node:fs/node:path because renderer code is forbidden
// from importing Node builtins (see biome.jsonc renderer override).

const rendererDir = `${import.meta.dir}/..`;

async function read(relPath: string): Promise<string> {
	return await Bun.file(`${rendererDir}/${relPath}`).text();
}

describe("posthog stitching regression guard (#5207 / #5164)", () => {
	test("posthog.ts has no device-id bootstrap or device_id/desktop_version super-props", async () => {
		const src = await read("lib/posthog.ts");
		expect(src).not.toContain("bootstrap");
		expect(src).not.toContain("device_id");
		expect(src).not.toContain("desktop_version");
	});

	test("PostHogProvider initializes PostHog without resolving a device id", async () => {
		const src = await read("providers/PostHogProvider/PostHogProvider.tsx");
		expect(src).toContain("initPostHog()");
		expect(src).not.toContain("getMachineId");
	});

	test("posthog.reset() fires only from useSignOut, never reactively", async () => {
		const identifier = await read(
			"components/PostHogUserIdentifier/PostHogUserIdentifier.tsx",
		);
		expect(identifier).not.toContain("posthog.reset()");

		const useSignOut = await read("hooks/useSignOut/useSignOut.ts");
		expect(useSignOut).toContain("posthog.reset()");
	});
});
