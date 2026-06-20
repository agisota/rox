import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
	CUSTOM_PROVIDER_SLUG,
	clearCustomProviderConfig,
	discoverCustomProviderModels,
	getCustomProviderConfig,
	getStoredCustomProviderApiKey,
	normalizeCustomProviderBaseUrl,
	setCustomProviderConfig,
	stripCustomProviderPrefix,
	syncMastracodeCustomProviderSettings,
	toCustomProviderWireModelId,
} from "./custom-provider-config";

let tempDir: string;
let configPath: string;
let mastracodeSettingsPath: string;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "rox-custom-provider-"));
	configPath = join(tempDir, "chat-custom-provider.json");
	mastracodeSettingsPath = join(tempDir, "mastracode-settings.json");
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
	it("uses the rox-custom slug", () => {
		expect(CUSTOM_PROVIDER_SLUG).toBe("rox-custom");
	});

	it("strips a rox-custom/ prefix and tolerates a legacy openai/ prefix", () => {
		expect(stripCustomProviderPrefix("rox-custom/foo-1")).toBe("foo-1");
		expect(stripCustomProviderPrefix("Rox-Custom/foo-1")).toBe("foo-1");
		expect(stripCustomProviderPrefix("openai/foo-1")).toBe("foo-1");
		expect(stripCustomProviderPrefix("foo-1")).toBe("foo-1");
	});

	it("builds a rox-custom/-prefixed wire id from any spelling", () => {
		expect(toCustomProviderWireModelId("foo-1")).toBe("rox-custom/foo-1");
		expect(toCustomProviderWireModelId("rox-custom/foo-1")).toBe(
			"rox-custom/foo-1",
		);
		expect(toCustomProviderWireModelId("openai/foo-1")).toBe(
			"rox-custom/foo-1",
		);
		expect(toCustomProviderWireModelId("  foo-1 ")).toBe("rox-custom/foo-1");
	});
});

describe("config persistence", () => {
	it("returns null when nothing is persisted", () => {
		expect(getCustomProviderConfig({ configPath })).toBeNull();
	});

	it("round-trips a saved config and strips model prefixes", () => {
		setCustomProviderConfig(
			{
				baseUrl: "https://api.example.com/v1/",
				apiKey: "sk-test",
				models: ["rox-custom/llama-3.3-70b", "gpt-oss"],
				defaultModelId: "gpt-oss",
			},
			{ configPath, mastracodeSettingsPath },
		);

		const config = getCustomProviderConfig({ configPath });
		expect(config).toEqual({
			baseUrl: "https://api.example.com/v1",
			apiKey: "sk-test",
			models: ["llama-3.3-70b", "gpt-oss"],
			defaultModelId: "gpt-oss",
		});
	});

	it("rejects an invalid base URL or empty key", () => {
		expect(() =>
			setCustomProviderConfig(
				{ baseUrl: "nope", apiKey: "sk", models: ["m"] },
				{ configPath, mastracodeSettingsPath },
			),
		).toThrow();
		expect(() =>
			setCustomProviderConfig(
				{ baseUrl: "https://x.example", apiKey: "  ", models: ["m"] },
				{ configPath, mastracodeSettingsPath },
			),
		).toThrow();
	});

	it("accepts an empty model list (discovery may be re-run later)", () => {
		setCustomProviderConfig(
			{ baseUrl: "https://x.example", apiKey: "sk", models: [] },
			{ configPath, mastracodeSettingsPath },
		);
		expect(getCustomProviderConfig({ configPath })).toEqual({
			baseUrl: "https://x.example",
			apiKey: "sk",
			models: [],
			defaultModelId: null,
		});
	});

	it("clears the persisted config and the mastracode entry", () => {
		setCustomProviderConfig(
			{ baseUrl: "https://x.example", apiKey: "sk", models: ["m"] },
			{ configPath, mastracodeSettingsPath },
		);
		expect(getCustomProviderConfig({ configPath })).not.toBeNull();
		clearCustomProviderConfig({ configPath, mastracodeSettingsPath });
		expect(getCustomProviderConfig({ configPath })).toBeNull();

		const settings = JSON.parse(readFileSync(mastracodeSettingsPath, "utf-8"));
		expect(settings.customProviders).toEqual([]);
	});
});

describe("v1 -> v2 migration", () => {
	it("migrates a v1 { modelId } config to v2 { models, defaultModelId }", () => {
		writeFileSync(
			configPath,
			JSON.stringify({
				version: 1,
				baseUrl: "https://api.example.com/v1",
				apiKey: "sk-old",
				modelId: "openai/llama-3.3-70b",
			}),
			"utf-8",
		);

		expect(getCustomProviderConfig({ configPath })).toEqual({
			baseUrl: "https://api.example.com/v1",
			apiKey: "sk-old",
			models: ["llama-3.3-70b"],
			defaultModelId: "llama-3.3-70b",
		});
	});

	it("returns null for an unknown/garbage version", () => {
		writeFileSync(
			configPath,
			JSON.stringify({ version: 99, baseUrl: "x", apiKey: "y" }),
			"utf-8",
		);
		expect(getCustomProviderConfig({ configPath })).toBeNull();

		writeFileSync(configPath, "not json", "utf-8");
		expect(getCustomProviderConfig({ configPath })).toBeNull();
	});
});

describe("syncMastracodeCustomProviderSettings", () => {
	const config = {
		baseUrl: "https://api.example.com/v1",
		apiKey: "sk-custom",
		models: ["llama-3.3-70b", "gpt-oss"],
		defaultModelId: null,
	};

	it("writes a rox-custom entry to the settings file", () => {
		syncMastracodeCustomProviderSettings(config, { mastracodeSettingsPath });
		const settings = JSON.parse(readFileSync(mastracodeSettingsPath, "utf-8"));
		expect(settings.customProviders).toEqual([
			{
				name: "rox-custom",
				url: "https://api.example.com/v1",
				apiKey: "sk-custom",
				models: ["llama-3.3-70b", "gpt-oss"],
			},
		]);
	});

	it("preserves other customProviders entries and dedupes by slug", () => {
		writeFileSync(
			mastracodeSettingsPath,
			JSON.stringify({
				yolo: true,
				customProviders: [
					{ name: "other", url: "https://other", models: ["a"] },
					{ name: "Rox Custom", url: "https://stale", models: ["stale"] },
				],
			}),
			"utf-8",
		);

		syncMastracodeCustomProviderSettings(config, { mastracodeSettingsPath });
		const settings = JSON.parse(readFileSync(mastracodeSettingsPath, "utf-8"));
		// Unrelated keys + entries survive; the stale rox-custom-slugged entry is
		// replaced by ours.
		expect(settings.yolo).toBe(true);
		expect(settings.customProviders).toEqual([
			{ name: "other", url: "https://other", models: ["a"] },
			{
				name: "rox-custom",
				url: "https://api.example.com/v1",
				apiKey: "sk-custom",
				models: ["llama-3.3-70b", "gpt-oss"],
			},
		]);
	});

	it("removes the entry when passed null", () => {
		syncMastracodeCustomProviderSettings(config, { mastracodeSettingsPath });
		syncMastracodeCustomProviderSettings(null, { mastracodeSettingsPath });
		const settings = JSON.parse(readFileSync(mastracodeSettingsPath, "utf-8"));
		expect(settings.customProviders).toEqual([]);
	});

	it("does not register an entry with an empty model list", () => {
		syncMastracodeCustomProviderSettings(
			{ ...config, models: [] },
			{ mastracodeSettingsPath },
		);
		const settings = JSON.parse(readFileSync(mastracodeSettingsPath, "utf-8"));
		expect(settings.customProviders).toEqual([]);
	});

	it("leaves no temp file behind (atomic write)", () => {
		syncMastracodeCustomProviderSettings(config, { mastracodeSettingsPath });
		// The real temp name is `${path}.${pid}.${ts}.tmp`, so assert no `.tmp`
		// sibling of the settings file remains — a fixed-name check would pass
		// trivially even if a uniquely-named temp file leaked.
		const leaked = readdirSync(dirname(mastracodeSettingsPath)).filter(
			(name) =>
				name.startsWith(basename(mastracodeSettingsPath)) &&
				name.endsWith(".tmp"),
		);
		expect(leaked).toEqual([]);
	});
});

describe("getStoredCustomProviderApiKey", () => {
	it("returns null when nothing is persisted", () => {
		expect(getStoredCustomProviderApiKey({ configPath })).toBeNull();
	});

	it("returns the saved key", () => {
		setCustomProviderConfig(
			{ baseUrl: "https://x.example", apiKey: "sk-stored", models: ["m"] },
			{ configPath, mastracodeSettingsPath },
		);
		expect(getStoredCustomProviderApiKey({ configPath })).toBe("sk-stored");
	});
});

describe("setCustomProviderConfig key reuse", () => {
	it("keeps the saved key when apiKey is omitted on a later save", () => {
		setCustomProviderConfig(
			{ baseUrl: "https://x.example", apiKey: "sk-stored", models: ["m1"] },
			{ configPath, mastracodeSettingsPath },
		);

		// Re-save with a new list without re-supplying the key.
		setCustomProviderConfig(
			{ baseUrl: "https://x.example", models: ["m1", "m2"] },
			{ configPath, mastracodeSettingsPath },
		);

		expect(getCustomProviderConfig({ configPath })).toEqual({
			baseUrl: "https://x.example",
			apiKey: "sk-stored",
			models: ["m1", "m2"],
			defaultModelId: null,
		});
	});

	it("keeps the saved key when apiKey is blank on a later save", () => {
		setCustomProviderConfig(
			{ baseUrl: "https://x.example", apiKey: "sk-stored", models: ["m1"] },
			{ configPath, mastracodeSettingsPath },
		);

		setCustomProviderConfig(
			{ baseUrl: "https://x.example", apiKey: "   ", models: ["m2"] },
			{ configPath, mastracodeSettingsPath },
		);

		expect(getCustomProviderConfig({ configPath })?.apiKey).toBe("sk-stored");
	});

	it("overwrites the saved key when a new one is supplied", () => {
		setCustomProviderConfig(
			{ baseUrl: "https://x.example", apiKey: "sk-old", models: ["m1"] },
			{ configPath, mastracodeSettingsPath },
		);

		setCustomProviderConfig(
			{ baseUrl: "https://x.example", apiKey: "sk-new", models: ["m1"] },
			{ configPath, mastracodeSettingsPath },
		);

		expect(getCustomProviderConfig({ configPath })?.apiKey).toBe("sk-new");
	});

	it("still rejects a save when no key is stored and none is supplied", () => {
		expect(() =>
			setCustomProviderConfig(
				{ baseUrl: "https://x.example", models: ["m"] },
				{ configPath, mastracodeSettingsPath },
			),
		).toThrow();
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

	it("falls back to /v1/models when the bare host 404s", async () => {
		const calls: string[] = [];
		const fetchImpl = (async (url: string) => {
			calls.push(url);
			if (url.endsWith("/v1/models")) {
				return jsonResponse({ data: [{ id: "m1" }] });
			}
			return jsonResponse({}, { ok: false, status: 404 });
		}) as unknown as typeof fetch;

		const models = await discoverCustomProviderModels({
			baseUrl: "https://api.example.com",
			apiKey: "sk-test",
			fetchImpl,
		});

		expect(calls).toEqual([
			"https://api.example.com/models",
			"https://api.example.com/v1/models",
		]);
		expect(models).toEqual([{ id: "m1" }]);
	});

	it("does not double-try when the base URL already ends in /v1", async () => {
		const calls: string[] = [];
		const fetchImpl = (async (url: string) => {
			calls.push(url);
			return jsonResponse({}, { ok: false, status: 404 });
		}) as unknown as typeof fetch;

		await expect(
			discoverCustomProviderModels({
				baseUrl: "https://api.example.com/v1",
				apiKey: "sk-test",
				fetchImpl,
			}),
		).rejects.toThrow();
		expect(calls).toEqual(["https://api.example.com/v1/models"]);
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
