import { describe, expect, test } from "bun:test";
import {
	AGENT_NATIVE_EMBED_MESSAGE_TYPES,
	AGENT_NATIVE_EMBED_PROTOCOL,
	AGENT_NATIVE_EMBED_VERSION,
	createAgentNativeEmbedEnvelope,
	createEmbedRequestId,
	isAgentNativeEmbedEnvelope,
} from "./protocol";

describe("createAgentNativeEmbedEnvelope", () => {
	test("stamps protocol and version", () => {
		const envelope = createAgentNativeEmbedEnvelope(
			AGENT_NATIVE_EMBED_MESSAGE_TYPES.MESSAGE,
			{ name: "test", payload: { a: 1 } },
		);
		expect(envelope.protocol).toBe(AGENT_NATIVE_EMBED_PROTOCOL);
		expect(envelope.version).toBe(AGENT_NATIVE_EMBED_VERSION);
		expect(envelope.type).toBe("message");
		expect(envelope.name).toBe("test");
		expect(envelope.payload).toEqual({ a: 1 });
	});

	test("round-trips through JSON and the guard", () => {
		const envelope = createAgentNativeEmbedEnvelope(
			AGENT_NATIVE_EMBED_MESSAGE_TYPES.REQUEST,
			{ name: "rox.ui-command", requestId: createEmbedRequestId() },
		);
		const wire = JSON.parse(JSON.stringify(envelope));
		expect(isAgentNativeEmbedEnvelope(wire)).toBe(true);
	});
});

describe("isAgentNativeEmbedEnvelope", () => {
	test("accepts every documented message type", () => {
		for (const type of Object.values(AGENT_NATIVE_EMBED_MESSAGE_TYPES)) {
			expect(
				isAgentNativeEmbedEnvelope({
					protocol: "agent-native.embed",
					version: 1,
					type,
				}),
			).toBe(true);
		}
	});

	test("accepts an error envelope with code", () => {
		expect(
			isAgentNativeEmbedEnvelope({
				protocol: "agent-native.embed",
				version: 1,
				type: "error",
				error: { message: "boom", code: "E_BOOM" },
			}),
		).toBe(true);
	});

	test.each([
		["null", null],
		["array", []],
		["string", "agent-native.embed"],
		["wrong protocol", { protocol: "other", version: 1, type: "message" }],
		[
			"wrong version",
			{ protocol: "agent-native.embed", version: 2, type: "message" },
		],
		[
			"unknown type",
			{ protocol: "agent-native.embed", version: 1, type: "nope" },
		],
		[
			"non-string name",
			{ protocol: "agent-native.embed", version: 1, type: "message", name: 5 },
		],
		[
			"non-string requestId",
			{
				protocol: "agent-native.embed",
				version: 1,
				type: "request",
				requestId: 5,
			},
		],
		[
			"malformed error",
			{
				protocol: "agent-native.embed",
				version: 1,
				type: "error",
				error: { code: 1 },
			},
		],
	])("rejects %s", (_label, value) => {
		expect(isAgentNativeEmbedEnvelope(value)).toBe(false);
	});
});

describe("createEmbedRequestId", () => {
	test("is unique and embed-prefixed", () => {
		const a = createEmbedRequestId();
		const b = createEmbedRequestId();
		expect(a).toStartWith("embed-");
		expect(a).not.toBe(b);
	});
});
