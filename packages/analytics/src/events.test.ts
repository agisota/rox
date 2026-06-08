import { describe, expect, it } from "bun:test";
import { ANALYTICS_EVENTS } from "@rox/shared/constants";
import { type AnalyticsEvent, isAnalyticsEventName } from "./events";

describe("analytics event catalog", () => {
	it("exposes canonical event names from @rox/shared", () => {
		expect(ANALYTICS_EVENTS.PROJECT_CREATED).toBe("project_created");
		expect(ANALYTICS_EVENTS.AGENT_RUN_COMPLETED).toBe("agent_run_completed");
		expect(ANALYTICS_EVENTS.PAYMENT_SUCCEEDED).toBe("payment_succeeded");
	});

	it("recognises every catalog event name via the type guard", () => {
		for (const name of Object.values(ANALYTICS_EVENTS)) {
			expect(isAnalyticsEventName(name)).toBe(true);
		}
	});

	it("rejects unknown event names", () => {
		expect(isAnalyticsEventName("not_a_real_event")).toBe(false);
		expect(isAnalyticsEventName("")).toBe(false);
	});

	it("types a fully-formed event with its payload", () => {
		const event: AnalyticsEvent<typeof ANALYTICS_EVENTS.AGENT_RUN_COMPLETED> = {
			name: ANALYTICS_EVENTS.AGENT_RUN_COMPLETED,
			properties: {
				run_id: "run_123",
				agent_type: "claude",
				model: "claude-opus-4-8",
				duration_ms: 4200,
				status: "completed",
				tokens: 1500,
				cost_usd: 0.12,
			},
		};
		expect(event.properties?.run_id).toBe("run_123");
	});
});
