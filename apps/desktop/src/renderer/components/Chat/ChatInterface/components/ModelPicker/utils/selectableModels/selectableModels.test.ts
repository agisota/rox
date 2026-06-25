import { describe, expect, it } from "bun:test";
import type { ModelOption } from "../../../../types";
import { CUSTOM_PROVIDER_DISPLAY_NAME } from "../customProvider";
import { resolveSelectableModels } from "./selectableModels";

const CATALOG: ModelOption[] = [
	{ id: "r1", name: "ROX R1", provider: "Rox" },
	{ id: "openai/gpt-5.5", name: "GPT-5.5", provider: "OpenAI" },
];

describe("resolveSelectableModels (shared)", () => {
	it("returns the catalog unchanged when no custom provider is configured", () => {
		expect(
			resolveSelectableModels({ models: CATALOG, customProviderConfig: null }),
		).toEqual(CATALOG);
	});

	it("appends every configured custom-provider model so their ids resolve", () => {
		const result = resolveSelectableModels({
			models: CATALOG,
			customProviderConfig: { models: ["llama-3.3-70b"] },
		});
		expect(
			result.find((model) => model.id === "rox-custom/llama-3.3-70b"),
		).toEqual({
			id: "rox-custom/llama-3.3-70b",
			name: "llama-3.3-70b",
			provider: CUSTOM_PROVIDER_DISPLAY_NAME,
		});
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
});
