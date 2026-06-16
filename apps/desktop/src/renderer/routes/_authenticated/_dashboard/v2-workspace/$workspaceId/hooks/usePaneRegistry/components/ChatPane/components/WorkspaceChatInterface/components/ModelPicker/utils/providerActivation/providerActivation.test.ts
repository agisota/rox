import { describe, expect, it } from "bun:test";
import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import type { AuthStatusLike } from "shared/ai/provider-status";
import {
	buildCustomProviderModel,
	CUSTOM_PROVIDER_DISPLAY_NAME,
	filterModelsByActivation,
	getActivatedProviderIds,
	isCustomProviderModel,
	providerDisplayNameToId,
	withCustomProviderModel,
} from "./providerActivation";

const connected: AuthStatusLike = {
	authenticated: true,
	method: "api_key",
	source: "managed",
	issue: null,
};
const disconnected: AuthStatusLike = {
	authenticated: false,
	method: null,
	source: null,
	issue: null,
};
const expired: AuthStatusLike = {
	authenticated: true,
	method: "oauth",
	source: "external",
	issue: "expired",
};

const CATALOG: ModelOption[] = [
	{ id: "r1", name: "ROX R1", provider: "Rox" },
	{ id: "anthropic/claude-opus-4-8", name: "Opus 4.8", provider: "Anthropic" },
	{ id: "openai/gpt-5.5", name: "GPT-5.5", provider: "OpenAI" },
	{ id: "groq/llama", name: "Llama", provider: "Groq" },
	{ id: "google/gemini-2.5-pro", name: "Gemini", provider: "Google Gemini" },
	{ id: "deepseek/deepseek-chat", name: "DeepSeek", provider: "DeepSeek" },
];

describe("providerDisplayNameToId", () => {
	it("maps known display names", () => {
		expect(providerDisplayNameToId("Rox")).toBe("rox");
		expect(providerDisplayNameToId("Anthropic")).toBe("anthropic");
		expect(providerDisplayNameToId("OpenAI")).toBe("openai");
		expect(providerDisplayNameToId("Groq")).toBe("groq");
		expect(providerDisplayNameToId("Google Gemini")).toBe("google");
		expect(providerDisplayNameToId("DeepSeek")).toBe("deepseek");
	});

	it("returns null for the custom group and unknowns", () => {
		expect(providerDisplayNameToId(CUSTOM_PROVIDER_DISPLAY_NAME)).toBeNull();
		expect(providerDisplayNameToId("Mystery")).toBeNull();
	});
});

describe("getActivatedProviderIds", () => {
	it("always includes rox", () => {
		expect(getActivatedProviderIds({}).has("rox")).toBe(true);
	});

	it("includes only connected providers", () => {
		const activated = getActivatedProviderIds({
			anthropic: connected,
			openai: disconnected,
			groq: connected,
			google: expired,
		});
		expect([...activated].sort()).toEqual(["anthropic", "groq", "rox"]);
		expect(activated.has("openai")).toBe(false);
		// Expired => needs_attention, not connected => excluded.
		expect(activated.has("google")).toBe(false);
	});
});

describe("filterModelsByActivation", () => {
	it("keeps rox + activated providers, hides the rest", () => {
		const activatedProviderIds = getActivatedProviderIds({
			anthropic: connected,
		});
		const visible = filterModelsByActivation({
			models: CATALOG,
			activatedProviderIds,
		});
		expect(visible.map((model) => model.provider).sort()).toEqual([
			"Anthropic",
			"Rox",
		]);
	});

	it("always keeps custom-provider models regardless of activation", () => {
		const customModel = buildCustomProviderModel({ modelId: "my-model" });
		const withCustom = withCustomProviderModel({
			models: CATALOG,
			customModel,
		});
		const visible = filterModelsByActivation({
			models: withCustom,
			activatedProviderIds: getActivatedProviderIds({}),
		});
		expect(
			visible.some((model) => model.provider === CUSTOM_PROVIDER_DISPLAY_NAME),
		).toBe(true);
		// Only Rox + custom survive when nothing else is connected.
		expect(visible.map((model) => model.id).sort()).toEqual([
			"openai/my-model",
			"r1",
		]);
	});
});

describe("buildCustomProviderModel", () => {
	it("builds an openai-prefixed model from config", () => {
		expect(buildCustomProviderModel({ modelId: "llama-3.3" })).toEqual({
			id: "openai/llama-3.3",
			name: "llama-3.3",
			provider: CUSTOM_PROVIDER_DISPLAY_NAME,
		});
	});

	it("returns null without a model id", () => {
		expect(buildCustomProviderModel(null)).toBeNull();
		expect(buildCustomProviderModel({ modelId: "  " })).toBeNull();
	});
});

describe("withCustomProviderModel", () => {
	it("appends the custom model, de-duplicated by id", () => {
		const customModel = buildCustomProviderModel({ modelId: "x" });
		const once = withCustomProviderModel({ models: CATALOG, customModel });
		expect(once).toHaveLength(CATALOG.length + 1);
		const twice = withCustomProviderModel({ models: once, customModel });
		expect(twice).toHaveLength(CATALOG.length + 1);
	});

	it("is a no-op when there is no custom model", () => {
		expect(
			withCustomProviderModel({ models: CATALOG, customModel: null }),
		).toBe(CATALOG);
	});
});

describe("isCustomProviderModel", () => {
	it("detects the synthetic custom group", () => {
		expect(
			isCustomProviderModel({
				id: "openai/x",
				name: "x",
				provider: CUSTOM_PROVIDER_DISPLAY_NAME,
			}),
		).toBe(true);
		expect(
			isCustomProviderModel({ id: "r1", name: "ROX R1", provider: "Rox" }),
		).toBe(false);
	});
});
