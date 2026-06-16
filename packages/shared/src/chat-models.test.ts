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
	ROX_COMPOUND_MODEL_ID,
	ROX_DEFAULT_MODEL_ID,
	ROX_FALLBACK_MODEL_ID,
	ROX_KEY_PROVISION_TOKEN_ENV,
	ROX_KEY_PROVISION_URL_ENV,
	resolveChatWireModelId,
	resolveRoxBaseUrl,
	resolveRoxFallbackWireModelId,
	resolveRoxModelChain,
	resolveRoxModelId,
	resolveRoxWireModelId,
} from "./chat-models";

describe("chat-models", () => {
	it("makes ROX R1 the first built-in chat model with a stable selection id", () => {
		// User-facing label is always "ROX R1"; the catalog id is a stable alias
		// (`rox-r1`) decoupled from the upstream wire model id.
		expect(ROX_CHAT_MODEL).toEqual({
			id: "rox-r1",
			name: "ROX R1",
			provider: "Rox",
		});
		expect(ROX_CHAT_MODEL_ID).toBe("rox-r1");
		expect(AVAILABLE_CHAT_MODELS[0]).toBe(ROX_CHAT_MODEL);
	});

	it("defaults the upstream model to the Compound combo with a deepseek fallback", () => {
		// `top` is the gateway's "best compound" combo (returns 200 today);
		// `deepseek-v4-flash` is a directly-routable fallback model.
		expect(ROX_COMPOUND_MODEL_ID).toBe("top");
		expect(ROX_DEFAULT_MODEL_ID).toBe(ROX_COMPOUND_MODEL_ID);
		expect(ROX_FALLBACK_MODEL_ID).toBe("deepseek-v4-flash");
	});

	it("documents the OpenAI-compatible Rox endpoint without embedding a key", () => {
		expect(ROX_AI_BASE_URL).toBe("https://api.zed.md/v1");
		expect(ROX_AI_API_KEY_ENV).toBe("ROX_AI_API_KEY");
		expect(ROX_AI_BASE_URL_ENV).toBe("ROX_AI_BASE_URL");
		expect(ROX_AI_MODEL_ENV).toBe("ROX_AI_MODEL");
		expect(ROX_KEY_PROVISION_URL_ENV).toBe("ROX_KEY_PROVISION_URL");
		expect(ROX_KEY_PROVISION_TOKEN_ENV).toBe("ROX_KEY_PROVISION_TOKEN");
	});

	it("never exposes the underlying model id or endpoint in the display name", () => {
		expect(ROX_CHAT_MODEL.name).not.toContain("api.zed.md");
		expect(ROX_CHAT_MODEL.name).not.toBe("top");
		expect(ROX_CHAT_MODEL.name).not.toBe("compound");
		expect(ROX_CHAT_MODEL.name).not.toBe("deepseek-v4-flash");
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
			"rox-r1",
			"ROX R1",
			"  rox-r1  ",
			"openai/rox-r1",
			"OpenAI/Rox-R1",
			// The current Compound/default upstream id round-trips back to the
			// house model so a message carrying the wire id is still recognised.
			"top",
			"openai/top",
			// Backward compatibility: older clients/metadata may still send these
			// legacy ids.
			"r1",
			"openai/r1",
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
			"deepseek-v4-flash",
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
		expect(resolveChatWireModelId("  ROX R1 ")).toBe(ROX_CHAT_WIRE_MODEL_ID);
		expect(resolveChatWireModelId(ROX_CHAT_MODEL_NAME)).toBe(
			ROX_CHAT_WIRE_MODEL_ID,
		);
		// Legacy ids still resolve to the current wire id.
		expect(resolveChatWireModelId("compound")).toBe(ROX_CHAT_WIRE_MODEL_ID);
		expect(resolveChatWireModelId("r1")).toBe(ROX_CHAT_WIRE_MODEL_ID);
	});

	it("passes non-Rox ids through, trimmed", () => {
		expect(resolveChatWireModelId("anthropic/claude-opus-4-8")).toBe(
			"anthropic/claude-opus-4-8",
		);
		expect(resolveChatWireModelId("  openai/gpt-5.5 ")).toBe("openai/gpt-5.5");
	});

	it("uses the openai-prefixed Compound id as the default wire id", () => {
		// Bare `top` would route through mastracode's Mastra gateway (no Rox
		// credential); the `openai/` prefix routes it through the OpenAI-compatible
		// client that reads OPENAI_BASE_URL + OPENAI_API_KEY. mastracode strips the
		// prefix, so api.zed.md receives the bare combo id `top`.
		expect(ROX_CHAT_WIRE_MODEL_ID).toBe("openai/top");
	});

	it("honors a ROX_AI_MODEL override for the wire id", () => {
		const env = { [ROX_AI_MODEL_ENV]: "compound" };
		expect(resolveChatWireModelId("ROX R1", env)).toBe("openai/compound");
		// An override that already carries an openai/ prefix is normalized.
		const prefixed = { [ROX_AI_MODEL_ENV]: "openai/compound" };
		expect(resolveChatWireModelId("rox-r1", prefixed)).toBe("openai/compound");
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

	it("resolveRoxModelId falls back to the Compound id and strips any prefix", () => {
		expect(resolveRoxModelId({})).toBe(ROX_COMPOUND_MODEL_ID);
		expect(resolveRoxModelId({ [ROX_AI_MODEL_ENV]: "openai/compound" })).toBe(
			"compound",
		);
	});

	it("resolveRoxWireModelId always carries the openai/ prefix", () => {
		expect(resolveRoxWireModelId({})).toBe("openai/top");
		expect(resolveRoxWireModelId({ [ROX_AI_MODEL_ENV]: "compound" })).toBe(
			"openai/compound",
		);
	});
});

describe("rox model failover chain", () => {
	it("returns [Compound, deepseek-v4-flash] by default", () => {
		expect(resolveRoxModelChain({})).toEqual(["top", "deepseek-v4-flash"]);
	});

	it("honors a ROX_AI_MODEL override as the chain primary", () => {
		expect(resolveRoxModelChain({ [ROX_AI_MODEL_ENV]: "compound" })).toEqual([
			"compound",
			"deepseek-v4-flash",
		]);
	});

	it("collapses to one entry when the primary already is the fallback", () => {
		// Never "fall back" to the model that just failed.
		expect(
			resolveRoxModelChain({ [ROX_AI_MODEL_ENV]: ROX_FALLBACK_MODEL_ID }),
		).toEqual([ROX_FALLBACK_MODEL_ID]);
		expect(
			resolveRoxModelChain({
				[ROX_AI_MODEL_ENV]: `openai/${ROX_FALLBACK_MODEL_ID}`,
			}),
		).toEqual([ROX_FALLBACK_MODEL_ID]);
	});

	it("resolveRoxFallbackWireModelId carries the openai/ prefix", () => {
		expect(resolveRoxFallbackWireModelId()).toBe("openai/deepseek-v4-flash");
	});
});
