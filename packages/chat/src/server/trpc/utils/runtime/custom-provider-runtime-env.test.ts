import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setCustomProviderConfig } from "../../../desktop/chat-service/custom-provider-config";
import {
	prepareCustomProviderRuntimeEnv,
	resolveCustomProviderRuntimeModelId,
	withCustomProviderRuntimeEnv,
} from "./custom-provider-runtime-env";

const QUEUE_RELEASE_TIMEOUT_MS = 1000;

let tempDir: string;
let mastracodeSettingsPath: string;
let originalRoxHomeDir: string | undefined;
let originalOpenAIKey: string | undefined;
let originalOpenAIBaseUrl: string | undefined;

function persistCustomProvider(models: string[]) {
	setCustomProviderConfig(
		{
			baseUrl: "https://api.example.com/v1",
			apiKey: "sk-custom",
			models,
		},
		{ mastracodeSettingsPath },
	);
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "rox-chat-custom-runtime-"));
	mastracodeSettingsPath = join(tempDir, "mastracode-settings.json");
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
	it("resolves the harness wire model without mutating env", () => {
		persistCustomProvider(["llama-3.3-70b"]);

		const prepared = prepareCustomProviderRuntimeEnv("llama-3.3-70b");

		expect(prepared).toEqual({
			isCustomModel: true,
			modelId: "rox-custom/llama-3.3-70b",
		});
		expect(
			resolveCustomProviderRuntimeModelId("rox-custom/llama-3.3-70b"),
		).toBe("rox-custom/llama-3.3-70b");
		// No OPENAI_* env is injected anymore — mastracode settings.json is the bridge.
		expect(process.env.OPENAI_API_KEY).toBeUndefined();
		expect(process.env.OPENAI_BASE_URL).toBeUndefined();
	});

	it("leaves ambient OPENAI env untouched when switching away from the custom model", () => {
		process.env.OPENAI_API_KEY = "sk-original";
		process.env.OPENAI_BASE_URL = "https://openai.example.com/v1";
		persistCustomProvider(["llama-3.3-70b"]);

		prepareCustomProviderRuntimeEnv("rox-custom/llama-3.3-70b");
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

	it("returns isCustomModel false when the selected model is cleared", () => {
		persistCustomProvider(["llama-3.3-70b"]);

		prepareCustomProviderRuntimeEnv("rox-custom/llama-3.3-70b");
		const prepared = prepareCustomProviderRuntimeEnv(undefined);

		expect(prepared).toEqual({ isCustomModel: false });
	});

	it("serializes scoped custom env operations", async () => {
		persistCustomProvider(["llama-3.3-70b"]);

		let secondStarted = false;
		let secondOperation: Promise<void> | undefined;

		await withCustomProviderRuntimeEnv("llama-3.3-70b", async (prepared) => {
			expect(prepared).toEqual({
				isCustomModel: true,
				modelId: "rox-custom/llama-3.3-70b",
			});

			secondOperation = withCustomProviderRuntimeEnv(
				"anthropic/claude-sonnet-4",
				async () => {
					secondStarted = true;
				},
			);

			await Promise.resolve();
			expect(secondStarted).toBe(false);
		});

		await secondOperation;
		expect(secondStarted).toBe(true);
	});

	it("releases the scoped env queue when preparation throws", async () => {
		const throwingModelId = {
			trim() {
				throw new Error("prepare failed");
			},
		} as unknown as string;

		await expect(
			withCustomProviderRuntimeEnv(throwingModelId, async () => {
				throw new Error("operation should not run");
			}),
		).rejects.toThrow("prepare failed");

		let secondStarted = false;
		await Promise.race([
			withCustomProviderRuntimeEnv(
				"anthropic/claude-sonnet-4",
				async (prepared) => {
					secondStarted = true;
					expect(prepared).toEqual({
						isCustomModel: false,
						modelId: "anthropic/claude-sonnet-4",
					});
				},
			),
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error("queue did not release")),
					QUEUE_RELEASE_TIMEOUT_MS,
				),
			),
		]);

		expect(secondStarted).toBe(true);
	});
});
