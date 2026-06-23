import { describe, expect, it } from "bun:test";
import {
	PIPELINE_TRIGGER_EVENT_KINDS,
	type PipelineEvent,
	triggerMatches,
} from "./triggerMatch";

function event(
	kind: PipelineEvent["kind"],
	payload: PipelineEvent["payload"] = {},
): PipelineEvent {
	return { kind, organizationId: "org-1", v2ProjectId: null, payload };
}

describe("triggerMatches", () => {
	it("rejects when the event kind differs from the trigger kind", () => {
		expect(
			triggerMatches({}, "user_sent_message", event("agent_run_finished")),
		).toBe(false);
	});

	it("matches an empty config for any event of the same kind", () => {
		for (const kind of PIPELINE_TRIGGER_EVENT_KINDS) {
			expect(triggerMatches({}, kind, event(kind))).toBe(true);
		}
	});

	it("filters user_sent_message by chat session", () => {
		const cfg = { chatSessionId: "chat-1" };
		expect(
			triggerMatches(
				cfg,
				"user_sent_message",
				event("user_sent_message", { chatSessionId: "chat-1" }),
			),
		).toBe(true);
		expect(
			triggerMatches(
				cfg,
				"user_sent_message",
				event("user_sent_message", { chatSessionId: "chat-2" }),
			),
		).toBe(false);
	});

	it("filters agent_run_finished by upstream node ids and roles", () => {
		const cfg = { afterNodeIds: ["n1"], afterRoleSlugs: ["critic"] };
		expect(
			triggerMatches(
				cfg,
				"agent_run_finished",
				event("agent_run_finished", { nodeId: "n1", roleSlug: "critic" }),
			),
		).toBe(true);
		expect(
			triggerMatches(
				cfg,
				"agent_run_finished",
				event("agent_run_finished", { nodeId: "n2", roleSlug: "critic" }),
			),
		).toBe(false);
	});

	it("filters file_or_artifact_created by glob and artifact kind", () => {
		expect(
			triggerMatches(
				{ pathGlob: "src/**/*.ts" },
				"file_or_artifact_created",
				event("file_or_artifact_created", { path: "src/a/b/c.ts" }),
			),
		).toBe(true);
		expect(
			triggerMatches(
				{ pathGlob: "src/*.ts" },
				"file_or_artifact_created",
				event("file_or_artifact_created", { path: "src/a/b/c.ts" }),
			),
		).toBe(false);
		expect(
			triggerMatches(
				{ artifactKind: "markdown_doc" },
				"file_or_artifact_created",
				event("file_or_artifact_created", { artifactKind: "json" }),
			),
		).toBe(false);
	});

	it("filters service_or_skill_connected by skill slug / integration id", () => {
		expect(
			triggerMatches(
				{ skillSlug: "critic" },
				"service_or_skill_connected",
				event("service_or_skill_connected", { skillSlug: "critic" }),
			),
		).toBe(true);
		expect(
			triggerMatches(
				{ integrationId: "int-1" },
				"service_or_skill_connected",
				event("service_or_skill_connected", { integrationId: "int-2" }),
			),
		).toBe(false);
	});

	it("agent_run_finished matches on node OR role alone (each clause independent)", () => {
		// afterNodeIds set, afterRoleSlugs absent: node must match, role unconstrained.
		expect(
			triggerMatches(
				{ afterNodeIds: ["n1"] },
				"agent_run_finished",
				event("agent_run_finished", { nodeId: "n1", roleSlug: "anything" }),
			),
		).toBe(true);
		// afterRoleSlugs set, afterNodeIds absent: role must match, node unconstrained.
		expect(
			triggerMatches(
				{ afterRoleSlugs: ["critic"] },
				"agent_run_finished",
				event("agent_run_finished", { nodeId: "whatever", roleSlug: "critic" }),
			),
		).toBe(true);
		// A role filter with no roleSlug on the event cannot match.
		expect(
			triggerMatches(
				{ afterRoleSlugs: ["critic"] },
				"agent_run_finished",
				event("agent_run_finished", { nodeId: "n1" }),
			),
		).toBe(false);
	});

	it("glob matching honors **, * (non-slash), and ? (single char)", () => {
		const cfg = (pathGlob: string) => ({ pathGlob });
		const fileEvent = (path: string) =>
			event("file_or_artifact_created", { path });
		// `**` crosses path separators.
		expect(
			triggerMatches(
				cfg("**/*.md"),
				"file_or_artifact_created",
				fileEvent("a/b/c.md"),
			),
		).toBe(true);
		// single `*` does NOT cross a slash.
		expect(
			triggerMatches(
				cfg("docs/*.md"),
				"file_or_artifact_created",
				fileEvent("docs/x/y.md"),
			),
		).toBe(false);
		// `?` matches exactly one (non-slash) char.
		expect(
			triggerMatches(
				cfg("v?.ts"),
				"file_or_artifact_created",
				fileEvent("v1.ts"),
			),
		).toBe(true);
		expect(
			triggerMatches(
				cfg("v?.ts"),
				"file_or_artifact_created",
				fileEvent("v10.ts"),
			),
		).toBe(false);
		// Regex metacharacters in the glob are matched literally (no injection).
		expect(
			triggerMatches(cfg("a.b"), "file_or_artifact_created", fileEvent("axb")),
		).toBe(false);
	});
});
