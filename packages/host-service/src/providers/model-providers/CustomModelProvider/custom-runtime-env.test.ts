import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setCustomProviderConfig } from "@rox/chat/server/desktop";
import { resolveCustomProviderRuntimeEnv } from "./custom-runtime-env";

let tempDir: string;
let configPath: string;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "rox-custom-runtime-"));
	configPath = join(tempDir, "chat-custom-provider.json");
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

describe("resolveCustomProviderRuntimeEnv", () => {
	it("is a no-op when no config is persisted", () => {
		const result = resolveCustomProviderRuntimeEnv(
			{ selectedModelId: "anything" },
			{ configPath },
		);
		expect(result).toEqual({ env: {}, isCustomModel: false });
	});

	it("injects OPENAI_* env when the selected model matches the saved model", () => {
		setCustomProviderConfig(
			{
				baseUrl: "https://api.example.com/v1",
				apiKey: "sk-custom",
				modelId: "llama-3.3-70b",
			},
			{ configPath },
		);

		// Accept both the bare id and the openai/-prefixed wire id.
		for (const selectedModelId of ["llama-3.3-70b", "openai/llama-3.3-70b"]) {
			const result = resolveCustomProviderRuntimeEnv(
				{ selectedModelId },
				{ configPath },
			);
			expect(result.isCustomModel).toBe(true);
			expect(result.env).toEqual({
				OPENAI_API_KEY: "sk-custom",
				OPENAI_BASE_URL: "https://api.example.com/v1",
			});
		}
	});

	it("is a no-op when a different model is selected", () => {
		setCustomProviderConfig(
			{
				baseUrl: "https://api.example.com/v1",
				apiKey: "sk-custom",
				modelId: "llama-3.3-70b",
			},
			{ configPath },
		);

		const result = resolveCustomProviderRuntimeEnv(
			{ selectedModelId: "anthropic/claude-opus-4-8" },
			{ configPath },
		);
		expect(result).toEqual({ env: {}, isCustomModel: false });
	});
});
