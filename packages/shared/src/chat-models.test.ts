import { describe, expect, it } from "bun:test";
import {
	AVAILABLE_CHAT_MODELS,
	isRoxHouseModel,
	ROX_AI_API_KEY_ENV,
	ROX_AI_BASE_URL,
	ROX_CHAT_MODEL,
	ROX_CHAT_MODEL_ID,
	ROX_CHAT_MODEL_NAME,
	ROX_CHAT_WIRE_MODEL_ID,
	resolveChatWireModelId,
} from "./chat-models";

describe("chat-models", () => {
	it("makes ROX R1 the first built-in chat model", () => {
		// User-facing label is always "ROX R1"; the wire id routes to `compound`.
		expect(ROX_CHAT_MODEL).toEqual({
			id: "compound",
			name: "ROX R1",
			provider: "Rox",
		});
		expect(ROX_CHAT_MODEL_ID).toBe("compound");
		expect(AVAILABLE_CHAT_MODELS[0]).toBe(ROX_CHAT_MODEL);
	});

	it("documents the OpenAI-compatible Rox endpoint without embedding a key", () => {
		expect(ROX_AI_BASE_URL).toBe("https://api.zed.md/v1");
		expect(ROX_AI_API_KEY_ENV).toBe("ROX_AI_API_KEY");
	});

	it("never exposes the underlying model id or endpoint in the display name", () => {
		expect(ROX_CHAT_MODEL.name).not.toContain("compound");
		expect(ROX_CHAT_MODEL.name).not.toContain("api.zed.md");
		expect(ROX_CHAT_MODEL.name).not.toBe("r1");
	});

	it("surfaces user-key providers in the model catalog", () => {
		const providers = new Set(
			AVAILABLE_CHAT_MODELS.map((model) => model.provider),
		);
		expect(providers.has("Groq")).toBe(true);
		expect(providers.has("Google Gemini")).toBe(true);
		expect(providers.has("DeepSeek")).toBe(true);
	});
});

describe("isRoxHouseModel", () => {
	it("accepts every Rox spelling regardless of case/whitespace/prefix", () => {
		for (const id of [
			"compound",
			"rox-r1",
			"r1",
			"ROX R1",
			"  Compound  ",
			"openai/compound",
			"OpenAI/Rox-R1",
		]) {
			expect(isRoxHouseModel(id)).toBe(true);
		}
	});

	it("rejects non-Rox and empty ids", () => {
		for (const id of [
			"anthropic/claude-opus-4-8",
			"openai/gpt-5.5",
			"groq/llama-3.3-70b-versatile",
			"compoundx",
			"",
			null,
			undefined,
		]) {
			expect(isRoxHouseModel(id)).toBe(false);
		}
	});
});

describe("resolveChatWireModelId", () => {
	it("maps every Rox spelling to the canonical wire id", () => {
		expect(resolveChatWireModelId(ROX_CHAT_MODEL_ID)).toBe(
			ROX_CHAT_WIRE_MODEL_ID,
		);
		expect(resolveChatWireModelId("rox-r1")).toBe(ROX_CHAT_WIRE_MODEL_ID);
		expect(resolveChatWireModelId("  R1 ")).toBe(ROX_CHAT_WIRE_MODEL_ID);
		expect(resolveChatWireModelId(ROX_CHAT_MODEL_NAME)).toBe(
			ROX_CHAT_WIRE_MODEL_ID,
		);
	});

	it("passes non-Rox ids through, trimmed", () => {
		expect(resolveChatWireModelId("anthropic/claude-opus-4-8")).toBe(
			"anthropic/claude-opus-4-8",
		);
		expect(resolveChatWireModelId("  openai/gpt-5.5 ")).toBe("openai/gpt-5.5");
	});

	it("uses the openai-prefixed compound id as the wire id", () => {
		// Bare `compound` would route through mastracode's Mastra gateway (no Rox
		// credential); the `openai/` prefix routes it through the OpenAI-compatible
		// client that reads OPENAI_BASE_URL + OPENAI_API_KEY.
		expect(ROX_CHAT_WIRE_MODEL_ID).toBe("openai/compound");
	});
});
