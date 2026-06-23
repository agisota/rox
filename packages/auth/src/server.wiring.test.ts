import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Wiring guard for issue #26.
 *
 * `afterCreateOrganization` must seed the demo project so every freshly-created
 * organization lands in a usable workspace. We cannot import `server.ts` here —
 * it constructs the better-auth instance + Neon clients at module load, which
 * requires full runtime env and network access. Instead we assert the wiring at
 * the source level: the hook references `seedDemoProject(organization.id)`. This
 * is a real regression guard — it fails if the call is removed or renamed — with
 * no env dependency.
 */
const SERVER_SRC = readFileSync(
	resolve(import.meta.dir, "./server.ts"),
	"utf8",
);

describe("afterCreateOrganization wiring (issue #26)", () => {
	it("imports seedDemoProject from @rox/db", () => {
		expect(SERVER_SRC).toContain(
			'import { seedDemoProject } from "@rox/db/seed-demo-project";',
		);
	});

	it("calls seedDemoProject for the newly-created organization", () => {
		// The org-create hook drops the demo project into the new org.
		expect(SERVER_SRC).toContain("seedDemoProject(organization.id)");
	});

	it("seeds the demo project inside the afterCreateOrganization hook, after default statuses", () => {
		const hookStart = SERVER_SRC.indexOf("afterCreateOrganization:");
		expect(hookStart).toBeGreaterThan(-1);

		const statusesIdx = SERVER_SRC.indexOf(
			"seedDefaultStatuses(organization.id)",
			hookStart,
		);
		const demoIdx = SERVER_SRC.indexOf(
			"seedDemoProject(organization.id)",
			hookStart,
		);

		expect(statusesIdx).toBeGreaterThan(-1);
		expect(demoIdx).toBeGreaterThan(-1);
		// Demo seeding runs after default statuses are in place.
		expect(demoIdx).toBeGreaterThan(statusesIdx);
	});
});
