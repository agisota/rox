import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setCustomProviderConfig } from "@rox/chat/server/desktop";
import { resolveCustomProviderRuntimeEnv } from "./custom-runtime-env";

let tempDir: string;
let configPath: string;
let mastracodeSettingsPath: string;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "rox-custom-runtime-"));
	configPath = join(tempDir, "chat-custom-provider.json");
	mastracodeSettingsPath = join(tempDir, "mastracode-settings.json");
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

	it("flags a custom model without injecting any env", () => {
		setCustomProviderConfig(
			{
				baseUrl: "https://api.example.com/v1",
				apiKey: "sk-custom",
				models: ["llama-3.3-70b", "gpt-oss"],
			},
			{ configPath, mastracodeSettingsPath },
		);

		// Accept the bare id, the rox-custom/ wire id, and a stray legacy openai/ id.
		for (const selectedModelId of [
			"llama-3.3-70b",
			"rox-custom/llama-3.3-70b",
			"openai/gpt-oss",
		]) {
			const result = resolveCustomProviderRuntimeEnv(
				{ selectedModelId },
				{ configPath },
			);
			expect(result.isCustomModel).toBe(true);
			expect(result.env).toEqual({});
		}
	});

	it("is a no-op when a different model is selected", () => {
		setCustomProviderConfig(
			{
				baseUrl: "https://api.example.com/v1",
				apiKey: "sk-custom",
				models: ["llama-3.3-70b"],
			},
			{ configPath, mastracodeSettingsPath },
		);

		const result = resolveCustomProviderRuntimeEnv(
			{ selectedModelId: "anthropic/claude-opus-4-8" },
			{ configPath },
		);
		expect(result).toEqual({ env: {}, isCustomModel: false });
	});
});
