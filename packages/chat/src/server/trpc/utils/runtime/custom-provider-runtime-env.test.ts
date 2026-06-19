import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setCustomProviderConfig } from "../../../desktop/chat-service/custom-provider-config";
import {
	prepareCustomProviderRuntimeEnv,
	resolveCustomProviderRuntimeModelId,
} from "./custom-provider-runtime-env";

let tempDir: string;
let originalRoxHomeDir: string | undefined;
let originalOpenAIKey: string | undefined;
let originalOpenAIBaseUrl: string | undefined;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "rox-chat-custom-runtime-"));
	originalRoxHomeDir = process.env.ROX_HOME_DIR;
	originalOpenAIKey = process.env.OPENAI_API_KEY;
	originalOpenAIBaseUrl = process.env.OPENAI_BASE_URL;
	process.env.ROX_HOME_DIR = tempDir;
	delete process.env.OPENAI_API_KEY;
	delete process.env.OPENAI_BASE_URL;
});

afterEach(() => {
	if (originalRoxHomeDir === undefined) {
		delete process.env.ROX_HOME_DIR;
	} else {
		process.env.ROX_HOME_DIR = originalRoxHomeDir;
	}
	if (originalOpenAIKey === undefined) {
		delete process.env.OPENAI_API_KEY;
	} else {
		process.env.OPENAI_API_KEY = originalOpenAIKey;
	}
	if (originalOpenAIBaseUrl === undefined) {
		delete process.env.OPENAI_BASE_URL;
	} else {
		process.env.OPENAI_BASE_URL = originalOpenAIBaseUrl;
	}
	rmSync(tempDir, { recursive: true, force: true });
});

describe("prepareCustomProviderRuntimeEnv", () => {
	it("sets OPENAI-compatible env and resolves the harness wire model", () => {
		setCustomProviderConfig({
			baseUrl: "https://api.example.com/v1",
			apiKey: "sk-custom",
			modelId: "llama-3.3-70b",
		});

		const prepared = prepareCustomProviderRuntimeEnv("llama-3.3-70b");

		expect(prepared).toEqual({
			isCustomModel: true,
			modelId: "openai/llama-3.3-70b",
		});
		expect(resolveCustomProviderRuntimeModelId("OpenAI/llama-3.3-70b")).toBe(
			"openai/llama-3.3-70b",
		);
		expect(process.env.OPENAI_API_KEY).toBe("sk-custom");
		expect(process.env.OPENAI_BASE_URL).toBe("https://api.example.com/v1");
	});

	it("restores prior OPENAI env when switching away from the custom model", () => {
		process.env.OPENAI_API_KEY = "sk-original";
		process.env.OPENAI_BASE_URL = "https://openai.example.com/v1";
		setCustomProviderConfig({
			baseUrl: "https://api.example.com/v1",
			apiKey: "sk-custom",
			modelId: "llama-3.3-70b",
		});

		prepareCustomProviderRuntimeEnv("openai/llama-3.3-70b");
		const prepared = prepareCustomProviderRuntimeEnv(
			"anthropic/claude-sonnet-4",
		);

		expect(prepared).toEqual({
			isCustomModel: false,
			modelId: "anthropic/claude-sonnet-4",
		});
		expect(process.env.OPENAI_API_KEY).toBe("sk-original");
		expect(process.env.OPENAI_BASE_URL).toBe("https://openai.example.com/v1");
	});
});
