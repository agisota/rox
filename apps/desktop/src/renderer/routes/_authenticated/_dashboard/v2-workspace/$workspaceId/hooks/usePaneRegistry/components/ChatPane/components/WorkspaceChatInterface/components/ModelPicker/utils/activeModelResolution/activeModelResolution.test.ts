import { describe, expect, it } from "bun:test";
import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
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
		// The custom model was persisted but is NOT in the current list (e.g.
		// `/v1/models` discovery failed). The historical bug silently returned the
		// house model and reported nothing — here we MUST surface the missing id.
		const result = resolveActiveModel({
			selectedModelId: "rox-custom/missing-model",
			availableModels: AVAILABLE,
			defaultModel: DEFAULT_MODEL,
		});
		expect(result.selectedModel).toBeNull();
		expect(result.unresolvedModelId).toBe("rox-custom/missing-model");
		// activeModel still falls back to default so the turn can be sent, but the
		// caller now has an explicit signal to show the toast/badge.
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
