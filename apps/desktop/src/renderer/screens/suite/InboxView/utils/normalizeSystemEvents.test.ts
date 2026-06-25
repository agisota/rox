import { describe, expect, it } from "bun:test";
import {
	mergeSystemEvents,
	normalizeAgentApprovalEvent,
	normalizeAutomationRunEvent,
	normalizePullRequestEvent,
	type SystemAgentApprovalRow,
	type SystemAutomationRunRow,
	type SystemPullRequestRow,
} from "./normalizeSystemEvents";

const pr = (
	over: Partial<SystemPullRequestRow> = {},
): SystemPullRequestRow => ({
	id: "node1",
	prNumber: 42,
	title: "Add inbox",
	url: "https://github.com/agisota/rox/pull/42",
	state: "open",
	reviewDecision: null,
	checksStatus: "pending",
	updatedAt: new Date("2026-06-24T10:00:00Z"),
	unread: true,
	...over,
});

const run = (
	over: Partial<SystemAutomationRunRow> = {},
): SystemAutomationRunRow => ({
	id: "run1",
	automationId: "auto1",
	title: "Ночной прогон",
	status: "dispatched",
	at: new Date("2026-06-24T09:00:00Z"),
	unread: true,
	...over,
});

const approval = (
	over: Partial<SystemAgentApprovalRow> = {},
): SystemAgentApprovalRow => ({
	id: "chat:s1",
	workspaceId: "ws1",
	title: "Агент ждёт",
	at: new Date("2026-06-24T08:00:00Z"),
	...over,
});

describe("normalizePullRequestEvent", () => {
	it("keys + threads by PR id and carries an open-pr action", () => {
		const item = normalizePullRequestEvent(pr({ id: "abc" }));
		expect(item.key).toBe("system:pr:abc");
		expect(item.source).toBe("system");
		expect(item.threadId).toBe("pr:abc");
		expect(item.title).toBe("PR #42: Add inbox");
		expect(item.systemAction).toEqual({
			kind: "open-pr",
			url: "https://github.com/agisota/rox/pull/42",
		});
		expect(item.unreadCount).toBe(1);
	});

	it("describes a failed-checks PR and a clean read PR", () => {
		expect(
			normalizePullRequestEvent(pr({ checksStatus: "failure" })).preview,
		).toBe("Проверки упали");
		const merged = normalizePullRequestEvent(
			pr({ state: "merged", checksStatus: "success", unread: false }),
		);
		expect(merged.preview).toBe("Влит");
		expect(merged.unreadCount).toBe(0);
	});
});

describe("normalizeAutomationRunEvent", () => {
	it("threads by automation id and carries an open-automation action", () => {
		const item = normalizeAutomationRunEvent(run());
		expect(item.key).toBe("system:automation:run1");
		expect(item.threadId).toBe("automation:auto1");
		expect(item.preview).toBe("Прогон запущен");
		expect(item.systemAction).toEqual({
			kind: "open-automation",
			automationId: "auto1",
		});
	});

	it("reports a failed run", () => {
		expect(
			normalizeAutomationRunEvent(run({ status: "dispatch_failed" })).preview,
		).toBe("Запуск не удался");
	});
});

describe("normalizeAgentApprovalEvent", () => {
	it("is always unread and routes to reply-agent", () => {
		const item = normalizeAgentApprovalEvent(approval());
		expect(item.key).toBe("system:agent:chat:s1");
		expect(item.threadId).toBe("agent:chat:s1");
		expect(item.unreadCount).toBe(1);
		expect(item.preview).toBe("Агент ждёт вашего ответа");
		expect(item.systemAction).toEqual({
			kind: "reply-agent",
			workspaceId: "ws1",
		});
	});
});

describe("mergeSystemEvents", () => {
	it("merges all three sources sorted newest-first", () => {
		const items = mergeSystemEvents({
			pullRequests: [
				pr({ id: "p", updatedAt: new Date("2026-06-24T10:00:00Z") }),
			],
			automationRuns: [run({ id: "r", at: new Date("2026-06-24T09:00:00Z") })],
			agentApprovals: [
				approval({ id: "a", at: new Date("2026-06-24T11:00:00Z") }),
			],
		});
		expect(items.map((i) => i.threadId)).toEqual([
			"agent:a",
			"pr:p",
			"automation:auto1",
		]);
	});

	it("collapses two runs of the same automation, keeping the newest event", () => {
		const items = mergeSystemEvents({
			automationRuns: [
				run({
					id: "old",
					at: new Date("2026-06-20T00:00:00Z"),
					status: "dispatch_failed",
				}),
				run({
					id: "new",
					at: new Date("2026-06-24T00:00:00Z"),
					status: "dispatched",
				}),
			],
		});
		expect(items).toHaveLength(1);
		expect(items[0]?.preview).toBe("Прогон запущен");
	});

	it("carries forward an unread badge from a stale event on the same thread", () => {
		const items = mergeSystemEvents({
			automationRuns: [
				run({
					id: "new",
					at: new Date("2026-06-24T00:00:00Z"),
					status: "dispatching",
					unread: false,
				}),
				run({
					id: "old",
					at: new Date("2026-06-20T00:00:00Z"),
					status: "dispatch_failed",
					unread: true,
				}),
			],
		});
		expect(items).toHaveLength(1);
		// Newest event wins for display, but the unread signal survives.
		expect(items[0]?.preview).toBe("Прогон запускается");
		expect(items[0]?.unreadCount).toBe(1);
	});

	it("returns an empty array for no sources (honest empty state)", () => {
		expect(mergeSystemEvents({})).toEqual([]);
	});

	it("sorts null timestamps last", () => {
		const items = mergeSystemEvents({
			pullRequests: [
				pr({ id: "nullts", updatedAt: null }),
				pr({ id: "dated", updatedAt: new Date("2026-06-24T00:00:00Z") }),
			],
		});
		expect(items.map((i) => i.threadId)).toEqual(["pr:dated", "pr:nullts"]);
	});
});
