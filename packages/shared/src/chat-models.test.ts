import { describe, expect, it } from "bun:test";
import {
	AVAILABLE_CHAT_MODELS,
	ROX_AI_API_KEY_ENV,
	ROX_AI_BASE_URL,
	ROX_CHAT_MODEL,
	ROX_CHAT_MODEL_ID,
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
