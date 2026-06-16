import { describe, expect, it } from "bun:test";
import {
	AVAILABLE_CHAT_MODELS,
	isRoxHouseModel,
	ROX_AI_API_KEY_ENV,
	ROX_AI_BASE_URL,
	ROX_AI_BASE_URL_ENV,
	ROX_AI_MODEL_ENV,
	ROX_CHAT_MODEL,
	ROX_CHAT_MODEL_ID,
	ROX_CHAT_MODEL_NAME,
	ROX_CHAT_WIRE_MODEL_ID,
	ROX_DEFAULT_MODEL_ID,
	resolveChatWireModelId,
	resolveRoxBaseUrl,
	resolveRoxModelId,
	resolveRoxWireModelId,
} from "./chat-models";

describe("chat-models", () => {
	it("makes ROX R1 the first built-in chat model", () => {
		// User-facing label is always "ROX R1"; the wire id routes to `r1`.
		expect(ROX_CHAT_MODEL).toEqual({
			id: "r1",
			name: "ROX R1",
			provider: "Rox",
		});
		expect(ROX_CHAT_MODEL_ID).toBe("r1");
		expect(ROX_DEFAULT_MODEL_ID).toBe("r1");
		expect(AVAILABLE_CHAT_MODELS[0]).toBe(ROX_CHAT_MODEL);
	});

	it("documents the OpenAI-compatible Rox endpoint without embedding a key", () => {
		expect(ROX_AI_BASE_URL).toBe("https://api.zed.md/v1");
		expect(ROX_AI_API_KEY_ENV).toBe("ROX_AI_API_KEY");
		expect(ROX_AI_BASE_URL_ENV).toBe("ROX_AI_BASE_URL");
		expect(ROX_AI_MODEL_ENV).toBe("ROX_AI_MODEL");
	});

	it("never exposes the underlying model id or endpoint in the display name", () => {
		expect(ROX_CHAT_MODEL.name).not.toContain("api.zed.md");
		expect(ROX_CHAT_MODEL.name).not.toBe("r1");
		expect(ROX_CHAT_MODEL.name).not.toBe("compound");
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
			"r1",
			"rox-r1",
			"ROX R1",
			"  R1  ",
			"openai/r1",
			"OpenAI/Rox-R1",
			// Backward compatibility: older clients/metadata may still send the
			// legacy `compound` id.
			"compound",
			"openai/compound",
		]) {
			expect(isRoxHouseModel(id)).toBe(true);
		}
	});

	it("rejects non-Rox and empty ids", () => {
		for (const id of [
			"anthropic/claude-opus-4-8",
			"openai/gpt-5.5",
			"groq/llama-3.3-70b-versatile",
			"r1x",
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
		// Legacy id still resolves to the current wire id.
		expect(resolveChatWireModelId("compound")).toBe(ROX_CHAT_WIRE_MODEL_ID);
	});

	it("passes non-Rox ids through, trimmed", () => {
		expect(resolveChatWireModelId("anthropic/claude-opus-4-8")).toBe(
			"anthropic/claude-opus-4-8",
		);
		expect(resolveChatWireModelId("  openai/gpt-5.5 ")).toBe("openai/gpt-5.5");
	});

	it("uses the openai-prefixed r1 id as the default wire id", () => {
		// Bare `r1` would route through mastracode's Mastra gateway (no Rox
		// credential); the `openai/` prefix routes it through the OpenAI-compatible
		// client that reads OPENAI_BASE_URL + OPENAI_API_KEY. mastracode strips the
		// prefix, so api.zed.md receives the bare `r1`.
		expect(ROX_CHAT_WIRE_MODEL_ID).toBe("openai/r1");
	});

	it("honors a ROX_AI_MODEL override for the wire id", () => {
		const env = { [ROX_AI_MODEL_ENV]: "r1-pro" };
		expect(resolveChatWireModelId("ROX R1", env)).toBe("openai/r1-pro");
		// An override that already carries an openai/ prefix is normalized.
		const prefixed = { [ROX_AI_MODEL_ENV]: "openai/r1-pro" };
		expect(resolveChatWireModelId("r1", prefixed)).toBe("openai/r1-pro");
	});
});

describe("rox env resolvers", () => {
	it("resolveRoxBaseUrl falls back to the default endpoint", () => {
		expect(resolveRoxBaseUrl({})).toBe(ROX_AI_BASE_URL);
	});

	it("resolveRoxBaseUrl honors ROX_AI_BASE_URL", () => {
		expect(
			resolveRoxBaseUrl({ [ROX_AI_BASE_URL_ENV]: "https://api.rox.one/v1" }),
		).toBe("https://api.rox.one/v1");
		// Whitespace-only is treated as unset.
		expect(resolveRoxBaseUrl({ [ROX_AI_BASE_URL_ENV]: "   " })).toBe(
			ROX_AI_BASE_URL,
		);
	});

	it("resolveRoxModelId falls back to r1 and strips any prefix", () => {
		expect(resolveRoxModelId({})).toBe("r1");
		expect(resolveRoxModelId({ [ROX_AI_MODEL_ENV]: "openai/r1-pro" })).toBe(
			"r1-pro",
		);
	});

	it("resolveRoxWireModelId always carries the openai/ prefix", () => {
		expect(resolveRoxWireModelId({})).toBe("openai/r1");
		expect(resolveRoxWireModelId({ [ROX_AI_MODEL_ENV]: "r1-pro" })).toBe(
			"openai/r1-pro",
		);
	});
});
