import { describe, expect, test } from "bun:test";
import {
	buildContextPacket,
	CONTEXT_MESSAGE_NAME,
	createContextEnvelope,
	MAX_SELECTION_TEXT_LENGTH,
	parseContextEnvelope,
} from "./context";

const ROUTE = { pathname: "/v2-workspace/ws-1" };

describe("buildContextPacket", () => {
	test("builds a packet without selection", () => {
		const packet = buildContextPacket({
			workspaceId: "ws-1",
			route: ROUTE,
			capturedAt: 123,
		});
		expect(packet).toEqual({
			workspaceId: "ws-1",
			route: ROUTE,
			capturedAt: 123,
		});
	});

	test("drops empty / whitespace-only selection", () => {
		const packet = buildContextPacket({
			workspaceId: "ws-1",
			route: ROUTE,
			selectionText: "   \n ",
		});
		expect(packet.selection).toBeUndefined();
	});

	test("keeps short selection as-is", () => {
		const packet = buildContextPacket({
			workspaceId: "ws-1",
			route: ROUTE,
			selectionText: "  hello world  ",
		});
		expect(packet.selection).toEqual({ text: "hello world" });
	});

	test("truncates oversized selection and flags it", () => {
		const packet = buildContextPacket({
			workspaceId: "ws-1",
			route: ROUTE,
			selectionText: "x".repeat(MAX_SELECTION_TEXT_LENGTH + 500),
		});
		expect(packet.selection?.text.length).toBe(MAX_SELECTION_TEXT_LENGTH);
		expect(packet.selection?.truncated).toBe(true);
	});

	test("defaults capturedAt to now", () => {
		const before = Date.now();
		const packet = buildContextPacket({ workspaceId: "ws-1", route: ROUTE });
		expect(packet.capturedAt).toBeGreaterThanOrEqual(before);
	});
});

describe("context envelope round-trip", () => {
	test("parseContextEnvelope accepts createContextEnvelope output", () => {
		const packet = buildContextPacket({
			workspaceId: "ws-1",
			route: { pathname: "/v2-workspace/ws-1", params: { tab: "files" } },
			selectionText: "selected",
		});
		const envelope = createContextEnvelope(packet);
		expect(envelope.name).toBe(CONTEXT_MESSAGE_NAME);

		const wire = JSON.parse(JSON.stringify(envelope));
		const parsed = parseContextEnvelope(wire);
		expect(parsed).toEqual({ ok: true, packet });
	});

	test("rejects non-envelope values", () => {
		const parsed = parseContextEnvelope({ workspaceId: "ws-1" });
		expect(parsed.ok).toBe(false);
	});

	test("rejects envelopes with the wrong name", () => {
		const envelope = {
			protocol: "agent-native.embed",
			version: 1,
			type: "message",
			name: "other.message",
			payload: {},
		};
		const parsed = parseContextEnvelope(envelope);
		expect(parsed.ok).toBe(false);
	});

	test("whitelist: rejects packets with extra fields", () => {
		const envelope = {
			protocol: "agent-native.embed",
			version: 1,
			type: "message",
			name: CONTEXT_MESSAGE_NAME,
			payload: {
				workspaceId: "ws-1",
				route: ROUTE,
				capturedAt: 1,
				env: { SECRET: "leak" },
			},
		};
		const parsed = parseContextEnvelope(envelope);
		expect(parsed.ok).toBe(false);
	});

	test("whitelist: rejects oversized selection on the wire", () => {
		const envelope = {
			protocol: "agent-native.embed",
			version: 1,
			type: "message",
			name: CONTEXT_MESSAGE_NAME,
			payload: {
				workspaceId: "ws-1",
				route: ROUTE,
				capturedAt: 1,
				selection: { text: "x".repeat(MAX_SELECTION_TEXT_LENGTH + 1) },
			},
		};
		const parsed = parseContextEnvelope(envelope);
		expect(parsed.ok).toBe(false);
	});
});
