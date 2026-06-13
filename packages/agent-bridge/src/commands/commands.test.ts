import { describe, expect, test } from "bun:test";
import {
	createUiCommandAckEnvelope,
	createUiCommandEnvelope,
	parseUiCommandAckEnvelope,
	parseUiCommandEnvelope,
	UI_COMMAND_REQUEST_NAME,
	uiCommandSchema,
} from "./commands";

describe("uiCommandSchema allow-list", () => {
	test("accepts navigate with absolute route", () => {
		const parsed = uiCommandSchema.safeParse({
			kind: "navigate",
			route: "/v2-workspace/ws-1",
		});
		expect(parsed.success).toBe(true);
	});

	test.each([
		["unknown kind", { kind: "execShell", command: "rm -rf /" }],
		["relative route", { kind: "navigate", route: "settings" }],
		["external url", { kind: "navigate", route: "https://evil.example" }],
		["extra fields", { kind: "navigate", route: "/a", force: true }],
		["empty route", { kind: "navigate", route: "" }],
	])("rejects %s", (_label, value) => {
		expect(uiCommandSchema.safeParse(value).success).toBe(false);
	});
});

describe("ui command envelope round-trip", () => {
	test("request round-trips through JSON", () => {
		const envelope = createUiCommandEnvelope({
			kind: "navigate",
			route: "/v2-workspace/ws-1",
		});
		expect(envelope.type).toBe("request");
		expect(envelope.name).toBe(UI_COMMAND_REQUEST_NAME);
		expect(envelope.requestId).toBeDefined();

		const wire = JSON.parse(JSON.stringify(envelope));
		const parsed = parseUiCommandEnvelope(wire);
		expect(parsed).toEqual({
			ok: true,
			command: { kind: "navigate", route: "/v2-workspace/ws-1" },
			requestId: envelope.requestId as string,
		});
	});

	test("request without requestId is rejected", () => {
		const envelope = {
			protocol: "agent-native.embed",
			version: 1,
			type: "request",
			name: UI_COMMAND_REQUEST_NAME,
			payload: { kind: "navigate", route: "/a" },
		};
		expect(parseUiCommandEnvelope(envelope).ok).toBe(false);
	});

	test("disallowed payload is rejected at parse time", () => {
		const envelope = {
			protocol: "agent-native.embed",
			version: 1,
			type: "request",
			name: UI_COMMAND_REQUEST_NAME,
			requestId: "embed-1",
			payload: { kind: "openFile", path: "/etc/passwd" },
		};
		const parsed = parseUiCommandEnvelope(envelope);
		expect(parsed.ok).toBe(false);
	});

	test("createUiCommandEnvelope throws on disallowed command", () => {
		expect(() =>
			createUiCommandEnvelope(
				// @ts-expect-error -- intentionally outside the union
				{ kind: "execShell", command: "ls" },
			),
		).toThrow();
	});
});

describe("ui command ack round-trip", () => {
	test("ok ack round-trips", () => {
		const envelope = createUiCommandAckEnvelope("embed-1", { ok: true });
		expect(envelope.type).toBe("response");
		expect(envelope.error).toBeUndefined();

		const wire = JSON.parse(JSON.stringify(envelope));
		expect(parseUiCommandAckEnvelope(wire)).toEqual({
			ok: true,
			requestId: "embed-1",
			result: { ok: true },
		});
	});

	test("failed ack carries the error in payload and envelope error", () => {
		const envelope = createUiCommandAckEnvelope("embed-2", {
			ok: false,
			error: "route not found",
		});
		expect(envelope.error).toEqual({ message: "route not found" });

		const wire = JSON.parse(JSON.stringify(envelope));
		const parsed = parseUiCommandAckEnvelope(wire);
		expect(parsed).toEqual({
			ok: true,
			requestId: "embed-2",
			result: { ok: false, error: "route not found" },
		});
	});

	test("ack without requestId is rejected", () => {
		const envelope = {
			protocol: "agent-native.embed",
			version: 1,
			type: "response",
			name: UI_COMMAND_REQUEST_NAME,
			payload: { ok: true },
		};
		expect(parseUiCommandAckEnvelope(envelope).ok).toBe(false);
	});
});
