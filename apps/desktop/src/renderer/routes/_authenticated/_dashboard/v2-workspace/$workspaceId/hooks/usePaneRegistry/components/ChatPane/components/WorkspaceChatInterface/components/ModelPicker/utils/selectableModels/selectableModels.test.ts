import { describe, expect, it } from "bun:test";
import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import { CUSTOM_PROVIDER_DISPLAY_NAME } from "../providerActivation";
import { resolveSelectableModels } from "./selectableModels";

const CATALOG: ModelOption[] = [
	{ id: "r1", name: "ROX R1", provider: "Rox" },
	{ id: "anthropic/claude-opus-4-8", name: "Opus 4.8", provider: "Anthropic" },
	{ id: "openai/gpt-5.5", name: "GPT-5.5", provider: "OpenAI" },
];

describe("resolveSelectableModels", () => {
	it("returns the catalog unchanged when no custom provider is configured", () => {
		expect(
			resolveSelectableModels({ models: CATALOG, customProviderConfig: null }),
		).toEqual(CATALOG);
		expect(
			resolveSelectableModels({
				models: CATALOG,
				customProviderConfig: undefined,
			}),
		).toEqual(CATALOG);
	});

	it("ignores a custom provider config with an empty model list", () => {
		expect(
			resolveSelectableModels({
				models: CATALOG,
				customProviderConfig: { models: [] },
			}),
		).toEqual(CATALOG);
	});

	it("appends every configured custom-provider model so their ids resolve", () => {
		const result = resolveSelectableModels({
			models: CATALOG,
			customProviderConfig: { models: ["llama-3.3-70b", "gpt-oss"] },
		});

		// Each custom model is added with the routing prefix; this is the exact id
		// the picker sets as the active model, so it must be resolvable here.
		expect(
			result.find((model) => model.id === "rox-custom/llama-3.3-70b"),
		).toEqual({
			id: "rox-custom/llama-3.3-70b",
			name: "llama-3.3-70b",
			provider: CUSTOM_PROVIDER_DISPLAY_NAME,
		});
		expect(result.find((model) => model.id === "rox-custom/gpt-oss")).toEqual({
			id: "rox-custom/gpt-oss",
			name: "gpt-oss",
			provider: CUSTOM_PROVIDER_DISPLAY_NAME,
		});
		expect(result).toHaveLength(CATALOG.length + 2);
	});

	it("merges live-discovered ids on top of the persisted list", () => {
		const result = resolveSelectableModels({
			models: CATALOG,
			customProviderConfig: { models: ["llama-3.3-70b"] },
			discoveredModelIds: ["llama-3.3-70b", "fresh-model"],
		});
		const customIds = result
			.filter((model) => model.provider === CUSTOM_PROVIDER_DISPLAY_NAME)
			.map((model) => model.id)
			.sort();
		expect(customIds).toEqual([
			"rox-custom/fresh-model",
			"rox-custom/llama-3.3-70b",
		]);
	});

	it("does not duplicate a custom model whose id already exists in the catalog", () => {
		const withExisting: ModelOption[] = [
			...CATALOG,
			{ id: "rox-custom/llama-3.3-70b", name: "Llama", provider: "OpenAI" },
		];
		const result = resolveSelectableModels({
			models: withExisting,
			customProviderConfig: { models: ["llama-3.3-70b"] },
		});
		expect(
			result.filter((model) => model.id === "rox-custom/llama-3.3-70b"),
		).toHaveLength(1);
		expect(result).toHaveLength(withExisting.length);
	});
});
