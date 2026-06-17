import { describe, expect, test } from "bun:test";
import {
	buildCliAgentRunFinishedEvent,
	buildUserSentMessageEvent,
} from "./pipelineEventSources";
import { type TriggerMatchConfig, triggerMatches } from "./triggerMatch";

describe("buildUserSentMessageEvent", () => {
	test("PES-01: produces a user_sent_message event with scope + payload", () => {
		const event = buildUserSentMessageEvent({
			scope: { organizationId: "org-1", v2ProjectId: "proj-1" },
			chatSessionId: "sess-1",
			message: "Сделай отчёт",
		});
		expect(event).toEqual({
			kind: "user_sent_message",
			organizationId: "org-1",
			v2ProjectId: "proj-1",
			payload: { chatSessionId: "sess-1", message: "Сделай отчёт" },
		});
	});

	test("PES-02: carries a null project scope through (org-wide event)", () => {
		const event = buildUserSentMessageEvent({
			scope: { organizationId: "org-1", v2ProjectId: null },
			chatSessionId: "sess-1",
			message: "hi",
		});
		expect(event.v2ProjectId).toBeNull();
	});

	test("PES-03: an unscoped trigger matches any session's event", () => {
		const event = buildUserSentMessageEvent({
			scope: { organizationId: "org-1", v2ProjectId: "proj-1" },
			chatSessionId: "sess-9",
			message: "go",
		});
		const cfg: TriggerMatchConfig = {};
		expect(triggerMatches(cfg, "user_sent_message", event)).toBe(true);
	});

	test("PES-04: a session-scoped trigger only matches its own session", () => {
		const matching = buildUserSentMessageEvent({
			scope: { organizationId: "org-1", v2ProjectId: "proj-1" },
			chatSessionId: "sess-1",
			message: "go",
		});
		const other = buildUserSentMessageEvent({
			scope: { organizationId: "org-1", v2ProjectId: "proj-1" },
			chatSessionId: "sess-2",
			message: "go",
		});
		const cfg: TriggerMatchConfig = { chatSessionId: "sess-1" };
		expect(triggerMatches(cfg, "user_sent_message", matching)).toBe(true);
		expect(triggerMatches(cfg, "user_sent_message", other)).toBe(false);
	});
});

describe("buildCliAgentRunFinishedEvent", () => {
	test("PES-05: produces an agent_run_finished event carrying node + role + session", () => {
		const event = buildCliAgentRunFinishedEvent({
			scope: { organizationId: "org-1", v2ProjectId: "proj-1" },
			agentRunRef: {
				kind: "terminal",
				sessionId: "term-1",
				roleSlug: "critic",
				nodeId: "node-a",
			},
		});
		expect(event).toEqual({
			kind: "agent_run_finished",
			organizationId: "org-1",
			v2ProjectId: "proj-1",
			payload: {
				nodeId: "node-a",
				roleSlug: "critic",
				childSessionId: "term-1",
				childSessionKind: "terminal",
			},
		});
	});

	test("PES-06: omits absent node/role fields (no undefined keys)", () => {
		const event = buildCliAgentRunFinishedEvent({
			scope: { organizationId: "org-1", v2ProjectId: null },
			agentRunRef: { kind: "terminal", sessionId: "term-2" },
		});
		expect("nodeId" in event.payload).toBe(false);
		expect("roleSlug" in event.payload).toBe(false);
		expect(event.payload.childSessionId).toBe("term-2");
	});

	test("PES-07: a role-scoped trigger matches the finished CLI agent's role", () => {
		const event = buildCliAgentRunFinishedEvent({
			scope: { organizationId: "org-1", v2ProjectId: "proj-1" },
			agentRunRef: {
				kind: "terminal",
				sessionId: "term-1",
				roleSlug: "critic",
			},
		});
		const matchCfg: TriggerMatchConfig = { afterRoleSlugs: ["critic"] };
		const missCfg: TriggerMatchConfig = { afterRoleSlugs: ["builder"] };
		expect(triggerMatches(matchCfg, "agent_run_finished", event)).toBe(true);
		expect(triggerMatches(missCfg, "agent_run_finished", event)).toBe(false);
	});

	test("PES-08: a node-scoped trigger matches the dispatching node id", () => {
		const event = buildCliAgentRunFinishedEvent({
			scope: { organizationId: "org-1", v2ProjectId: "proj-1" },
			agentRunRef: { kind: "terminal", sessionId: "term-1", nodeId: "node-a" },
		});
		const matchCfg: TriggerMatchConfig = { afterNodeIds: ["node-a"] };
		const missCfg: TriggerMatchConfig = { afterNodeIds: ["node-z"] };
		expect(triggerMatches(matchCfg, "agent_run_finished", event)).toBe(true);
		expect(triggerMatches(missCfg, "agent_run_finished", event)).toBe(false);
	});
});
