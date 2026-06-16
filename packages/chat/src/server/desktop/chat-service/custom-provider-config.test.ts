import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	clearCustomProviderConfig,
	discoverCustomProviderModels,
	getCustomProviderConfig,
	normalizeCustomProviderBaseUrl,
	setCustomProviderConfig,
	stripOpenAIProviderPrefix,
	toCustomProviderWireModelId,
} from "./custom-provider-config";

let tempDir: string;
let configPath: string;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "rox-custom-provider-"));
	configPath = join(tempDir, "chat-custom-provider.json");
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

describe("normalizeCustomProviderBaseUrl", () => {
	it("trims trailing slashes and keeps the path", () => {
		expect(normalizeCustomProviderBaseUrl("https://api.example.com/v1/")).toBe(
			"https://api.example.com/v1",
		);
	});

	it("rejects empty and non-http(s) URLs", () => {
		expect(normalizeCustomProviderBaseUrl("")).toBeNull();
		expect(normalizeCustomProviderBaseUrl("   ")).toBeNull();
		expect(normalizeCustomProviderBaseUrl("ftp://x.example")).toBeNull();
		expect(normalizeCustomProviderBaseUrl("not a url")).toBeNull();
	});
});

describe("model id helpers", () => {
	it("strips an openai/ prefix", () => {
		expect(stripOpenAIProviderPrefix("openai/foo-1")).toBe("foo-1");
		expect(stripOpenAIProviderPrefix("foo-1")).toBe("foo-1");
	});

	it("builds an openai/-prefixed wire id from any spelling", () => {
		expect(toCustomProviderWireModelId("foo-1")).toBe("openai/foo-1");
		expect(toCustomProviderWireModelId("openai/foo-1")).toBe("openai/foo-1");
		expect(toCustomProviderWireModelId("  foo-1 ")).toBe("openai/foo-1");
	});
});

describe("config persistence", () => {
	it("returns null when nothing is persisted", () => {
		expect(getCustomProviderConfig({ configPath })).toBeNull();
	});

	it("round-trips a saved config and strips the model prefix", () => {
		setCustomProviderConfig(
			{
				baseUrl: "https://api.example.com/v1/",
				apiKey: "sk-test",
				modelId: "openai/llama-3.3-70b",
			},
			{ configPath },
		);

		const config = getCustomProviderConfig({ configPath });
		expect(config).toEqual({
			baseUrl: "https://api.example.com/v1",
			apiKey: "sk-test",
			modelId: "llama-3.3-70b",
		});
	});

	it("rejects an invalid base URL, empty key, or empty model", () => {
		expect(() =>
			setCustomProviderConfig(
				{ baseUrl: "nope", apiKey: "sk", modelId: "m" },
				{ configPath },
			),
		).toThrow();
		expect(() =>
			setCustomProviderConfig(
				{ baseUrl: "https://x.example", apiKey: "  ", modelId: "m" },
				{ configPath },
			),
		).toThrow();
		expect(() =>
			setCustomProviderConfig(
				{ baseUrl: "https://x.example", apiKey: "sk", modelId: " " },
				{ configPath },
			),
		).toThrow();
	});

	it("clears the persisted config", () => {
		setCustomProviderConfig(
			{ baseUrl: "https://x.example", apiKey: "sk", modelId: "m" },
			{ configPath },
		);
		expect(getCustomProviderConfig({ configPath })).not.toBeNull();
		clearCustomProviderConfig({ configPath });
		expect(getCustomProviderConfig({ configPath })).toBeNull();
	});
});

describe("discoverCustomProviderModels", () => {
	function jsonResponse(
		body: unknown,
		init?: { ok?: boolean; status?: number },
	) {
		return {
			ok: init?.ok ?? true,
			status: init?.status ?? 200,
			statusText: "OK",
			json: async () => body,
		} as unknown as Response;
	}

	it("parses the OpenAI { data: [{ id }] } shape, dedupes and sorts", async () => {
		let calledUrl = "";
		let authHeader = "";
		const fetchImpl = (async (url: string, options?: RequestInit) => {
			calledUrl = url;
			authHeader = (options?.headers as Record<string, string>)?.Authorization;
			return jsonResponse({
				data: [{ id: "zeta" }, { id: "alpha" }, { id: "alpha" }, {}],
			});
		}) as unknown as typeof fetch;

		const models = await discoverCustomProviderModels({
			baseUrl: "https://api.example.com/v1/",
			apiKey: "sk-test",
			fetchImpl,
		});

		expect(calledUrl).toBe("https://api.example.com/v1/models");
		expect(authHeader).toBe("Bearer sk-test");
		expect(models).toEqual([{ id: "alpha" }, { id: "zeta" }]);
	});

	it("parses a bare array shape", async () => {
		const fetchImpl = (async () =>
			jsonResponse([{ id: "m1" }, { id: "m2" }])) as unknown as typeof fetch;

		const models = await discoverCustomProviderModels({
			baseUrl: "https://api.example.com/v1",
			apiKey: "sk-test",
			fetchImpl,
		});

		expect(models).toEqual([{ id: "m1" }, { id: "m2" }]);
	});

	it("throws on a non-OK response", async () => {
		const fetchImpl = (async () =>
			jsonResponse({}, { ok: false, status: 401 })) as unknown as typeof fetch;

		await expect(
			discoverCustomProviderModels({
				baseUrl: "https://api.example.com/v1",
				apiKey: "bad",
				fetchImpl,
			}),
		).rejects.toThrow(/401/);
	});

	it("validates inputs before calling fetch", async () => {
		let called = false;
		const fetchImpl = (async () => {
			called = true;
			return jsonResponse([]);
		}) as unknown as typeof fetch;

		await expect(
			discoverCustomProviderModels({
				baseUrl: "nope",
				apiKey: "sk",
				fetchImpl,
			}),
		).rejects.toThrow();
		expect(called).toBe(false);
	});
});
