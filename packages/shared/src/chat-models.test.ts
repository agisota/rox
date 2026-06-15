import { describe, expect, it } from "bun:test";
import {
	AVAILABLE_CHAT_MODELS,
	ROX_AI_API_KEY_ENV,
	ROX_AI_BASE_URL,
	ROX_CHAT_MODEL,
	ROX_CHAT_MODEL_ID,
} from "./chat-models";

describe("chat-models", () => {
	it("makes ROX-1 the first built-in chat model", () => {
		expect(ROX_CHAT_MODEL).toEqual({
			id: "r1",
			name: "ROX-1",
			provider: "Rox",
		});
		expect(ROX_CHAT_MODEL_ID).toBe("r1");
		expect(AVAILABLE_CHAT_MODELS[0]).toBe(ROX_CHAT_MODEL);
	});

	it("documents the OpenAI-compatible Rox endpoint without embedding a key", () => {
		expect(ROX_AI_BASE_URL).toBe("https://api.rox.one/v1");
		expect(ROX_AI_API_KEY_ENV).toBe("ROX_AI_API_KEY");
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
