import { describe, expect, it } from "bun:test";
import { ANALYTICS_EVENTS } from "@rox/shared/constants";
import {
	coveredEvents,
	findUncoveredEvents,
	KNOWN_COVERAGE_GAPS,
	USER_PATH_COVERAGE,
} from "./user-path";

describe("user-path coverage map", () => {
	it("references only canonical analytics events", () => {
		const valid = new Set<string>(Object.values(ANALYTICS_EVENTS));
		for (const stage of USER_PATH_COVERAGE) {
			for (const event of stage.events) {
				expect(valid.has(event)).toBe(true);
			}
		}
	});

	it("has unique, non-empty stage ids and labels", () => {
		const ids = USER_PATH_COVERAGE.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const stage of USER_PATH_COVERAGE) {
			expect(stage.id.length).toBeGreaterThan(0);
			expect(stage.label.length).toBeGreaterThan(0);
			expect(stage.events.length).toBeGreaterThan(0);
		}
	});

	it("maps every canonical event exactly once — no duplicates", () => {
		const covered = coveredEvents();
		expect(new Set(covered).size).toBe(covered.length);
	});

	it("covers the whole event catalog (no uncovered events)", () => {
		expect(findUncoveredEvents()).toEqual([]);
	});

	it("documents known journey gaps with a stage and description", () => {
		expect(KNOWN_COVERAGE_GAPS.length).toBeGreaterThan(0);
		for (const gap of KNOWN_COVERAGE_GAPS) {
			expect(gap.stage.length).toBeGreaterThan(0);
			expect(gap.description.length).toBeGreaterThan(0);
		}
	});
});
