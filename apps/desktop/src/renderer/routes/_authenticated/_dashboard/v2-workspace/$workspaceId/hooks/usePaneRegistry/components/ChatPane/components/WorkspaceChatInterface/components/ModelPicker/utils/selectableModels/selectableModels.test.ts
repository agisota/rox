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

	it("ignores a custom provider config with a blank model id", () => {
		expect(
			resolveSelectableModels({
				models: CATALOG,
				customProviderConfig: { modelId: "   " },
			}),
		).toEqual(CATALOG);
	});

	it("appends the configured custom-provider model so its id resolves", () => {
		const result = resolveSelectableModels({
			models: CATALOG,
			customProviderConfig: { modelId: "llama-3.3-70b" },
		});

		// The custom model is added with the OpenAI-compatible routing prefix; this
		// is the exact id the picker sets as the active model, so it must be
		// resolvable here (otherwise the composer falls back to the house model).
		const custom = result.find((model) => model.id === "openai/llama-3.3-70b");
		expect(custom).toEqual({
			id: "openai/llama-3.3-70b",
			name: "llama-3.3-70b",
			provider: CUSTOM_PROVIDER_DISPLAY_NAME,
		});
		expect(result).toHaveLength(CATALOG.length + 1);
	});

	it("does not duplicate a custom model whose id already exists in the catalog", () => {
		const withExisting: ModelOption[] = [
			...CATALOG,
			{ id: "openai/llama-3.3-70b", name: "Llama", provider: "OpenAI" },
		];
		const result = resolveSelectableModels({
			models: withExisting,
			customProviderConfig: { modelId: "llama-3.3-70b" },
		});
		expect(
			result.filter((model) => model.id === "openai/llama-3.3-70b"),
		).toHaveLength(1);
		expect(result).toHaveLength(withExisting.length);
	});
});
