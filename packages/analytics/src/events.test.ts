import { describe, expect, it } from "bun:test";
import { ANALYTICS_EVENTS } from "@rox/shared/constants";
import {
	type AnalyticsEvent,
	createAppOpenedEvent,
	createSignInCompletedEvent,
	createWorkspaceCreatedEvent,
	isAnalyticsEventName,
} from "./events";

describe("analytics event catalog", () => {
	it("exposes canonical event names from @rox/shared", () => {
		expect(ANALYTICS_EVENTS.PROJECT_CREATED).toBe("project_created");
		expect(ANALYTICS_EVENTS.APP_OPENED).toBe("app_opened");
		expect(ANALYTICS_EVENTS.SIGN_IN_COMPLETED).toBe("sign_in_completed");
		expect(ANALYTICS_EVENTS.WORKSPACE_CREATED).toBe("workspace_created");
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

	it("maps app_opened without user PII", () => {
		const event = createAppOpenedEvent({
			appVersion: "2.0.1",
			platform: "darwin",
			email: "person@example.com",
			name: "Example Person",
			token: "secret-token",
		});

		expect(event).toEqual({
			name: ANALYTICS_EVENTS.APP_OPENED,
			properties: {
				app_version: "2.0.1",
				platform: "darwin",
			},
		});
		expect(JSON.stringify(event)).not.toContain("person@example.com");
		expect(JSON.stringify(event)).not.toContain("Example Person");
		expect(JSON.stringify(event)).not.toContain("secret-token");
	});

	it("maps sign_in_completed to ids only", () => {
		const event = createSignInCompletedEvent({
			userId: "user_123",
			organizationId: "org_456",
			email: "person@example.com",
			name: "Example Person",
			token: "secret-token",
		});

		expect(event).toEqual({
			name: ANALYTICS_EVENTS.SIGN_IN_COMPLETED,
			properties: {
				user_id: "user_123",
				organization_id: "org_456",
			},
		});
		expect(JSON.stringify(event)).not.toContain("person@example.com");
		expect(JSON.stringify(event)).not.toContain("Example Person");
		expect(JSON.stringify(event)).not.toContain("secret-token");
	});

	it("maps workspace_created to workspace/project ids only", () => {
		const event = createWorkspaceCreatedEvent({
			workspaceId: "workspace_123",
			projectId: "project_456",
			source: "desktop_renderer",
			wasExisting: false,
			workspaceName: "Sensitive customer project",
			prompt: "Build a private acquisition plan",
		});

		expect(event).toEqual({
			name: ANALYTICS_EVENTS.WORKSPACE_CREATED,
			properties: {
				workspace_id: "workspace_123",
				project_id: "project_456",
				source: "desktop_renderer",
				was_existing: false,
			},
		});
		expect(JSON.stringify(event)).not.toContain("Sensitive customer project");
		expect(JSON.stringify(event)).not.toContain("private acquisition");
	});
});
