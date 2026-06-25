import { describe, expect, it } from "bun:test";
import type { ModelOption } from "../../../../types";
import {
	resolveActiveModel,
	unresolvedModelMessage,
} from "./activeModelResolution";

const DEFAULT_MODEL: ModelOption = {
	id: "r1",
	name: "ROX R1",
	provider: "Rox",
};
const AVAILABLE: ModelOption[] = [
	DEFAULT_MODEL,
	{ id: "openai/gpt-5.5", name: "GPT-5.5", provider: "OpenAI" },
	{
		id: "rox-custom/llama-3.3-70b",
		name: "llama-3.3-70b",
		provider: "Свой провайдер",
	},
];

describe("resolveActiveModel", () => {
	it("uses the default model when nothing is selected", () => {
		expect(
			resolveActiveModel({
				selectedModelId: null,
				availableModels: AVAILABLE,
				defaultModel: DEFAULT_MODEL,
			}),
		).toEqual({
			activeModel: DEFAULT_MODEL,
			selectedModel: null,
			unresolvedModelId: null,
		});
	});

	it("resolves a persisted selection that exists in the list", () => {
		const result = resolveActiveModel({
			selectedModelId: "rox-custom/llama-3.3-70b",
			availableModels: AVAILABLE,
			defaultModel: DEFAULT_MODEL,
		});
		expect(result.activeModel?.id).toBe("rox-custom/llama-3.3-70b");
		expect(result.selectedModel?.id).toBe("rox-custom/llama-3.3-70b");
		expect(result.unresolvedModelId).toBeNull();
	});

	it("reports an unresolved persisted selection instead of swapping silently", () => {
		const result = resolveActiveModel({
			selectedModelId: "rox-custom/missing-model",
			availableModels: AVAILABLE,
			defaultModel: DEFAULT_MODEL,
		});
		expect(result.selectedModel).toBeNull();
		expect(result.unresolvedModelId).toBe("rox-custom/missing-model");
		expect(result.activeModel).toEqual(DEFAULT_MODEL);
	});

	it("treats an empty selection id as no selection", () => {
		expect(
			resolveActiveModel({
				selectedModelId: "",
				availableModels: AVAILABLE,
				defaultModel: DEFAULT_MODEL,
			}).unresolvedModelId,
		).toBeNull();
	});
});

describe("unresolvedModelMessage", () => {
	it("names the missing model in the RU signal", () => {
		expect(unresolvedModelMessage("rox-custom/missing-model")).toBe(
			"Модель rox-custom/missing-model недоступна — проверьте custom-провайдер",
		);
	});
});
