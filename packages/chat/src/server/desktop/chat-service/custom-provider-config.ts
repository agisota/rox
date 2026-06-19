import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, join } from "node:path";

/**
 * Persistence + discovery for a user-supplied, OpenAI-compatible "custom"
 * provider. The user enters a base URL + API key; the app discovers available
 * models by calling `GET {baseUrl}/models` (the OpenAI list-models surface) and
 * exposes the whole list in the chat model picker.
 *
 * Routing: custom models are NOT routed through mastracode's `openai/*`
 * (Responses API) path — third-party OpenAI-compatible servers implement
 * `/chat/completions`, not `/responses`. Instead the provider is registered in
 * mastracode's global `settings.json` under `customProviders` as a first-class
 * provider (`{ name, url, apiKey?, models[] }`). mastracode's `resolveModel`
 * checks `customProviders` first and routes a `<slug>/<id>` wire model through
 * its OpenAI-compatible chat-completions client. The slug is `rox-custom` so it
 * never collides with a reserved provider (openai/anthropic/moonshotai/…).
 *
 * Rox's own JSON config lives on disk under `ROX_HOME_DIR` so the long-lived
 * desktop `ChatService` (which owns settings reads/writes) and the host-service
 * model providers (which detect the active custom model) read the same source
 * of truth across processes — the same anchor the Anthropic env config uses.
 * The cross-process bridge for the harness is the mastracode settings.json
 * written here, not process env.
 */

const CONFIG_FILE_NAME = "chat-custom-provider.json";

/**
 * The mastracode custom-provider name (and, after slugification, the wire-id
 * provider segment). Chosen so the slug `rox-custom` never collides with a
 * reserved provider (openai/anthropic/moonshotai/copilot/mastra).
 */
export const CUSTOM_PROVIDER_NAME = "rox-custom";

/**
 * Slug derived from {@link CUSTOM_PROVIDER_NAME} using mastracode's exact rule
 * (`name.toLowerCase().replace(/[^a-z0-9]+/g, "-")` + edge-dash trim). The wire
 * id is `<slug>/<modelId>`.
 */
export const CUSTOM_PROVIDER_SLUG = customProviderSlug(CUSTOM_PROVIDER_NAME);

/** Provider prefix that routes a model through the custom OpenAI-compatible client. */
export const CUSTOM_PROVIDER_PREFIX = `${CUSTOM_PROVIDER_SLUG}/`;

/** Legacy prefix used before the routing fix; stripped for migration tolerance. */
const LEGACY_OPENAI_PROVIDER_PREFIX = "openai/";

/**
 * Replicate mastracode's `getCustomProviderId`: lowercase, collapse any run of
 * non-alphanumerics to a single dash, trim leading/trailing dashes. Falls back
 * to `"provider"` for an empty result, mirroring upstream.
 */
function customProviderSlug(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "provider";
}

export interface CustomProviderConfig {
	/** OpenAI-compatible base URL, e.g. `https://api.example.com/v1`. */
	baseUrl: string;
	/** API key sent as `Authorization: Bearer <apiKey>`. */
	apiKey: string;
	/** All bare model ids discovered from the provider's `/models` endpoint. */
	models: string[];
	/** The user's preferred default model id, or null. */
	defaultModelId: string | null;
}

export interface PersistedCustomProviderConfig {
	version: 2;
	baseUrl: string;
	apiKey: string;
	models: string[];
	defaultModelId: string | null;
}

export interface CustomProviderConfigDiskOptions {
	configPath?: string;
	/**
	 * Override the mastracode `settings.json` path. Injected for tests so the
	 * sync helper can write to a temp file instead of the real app-data dir.
	 */
	mastracodeSettingsPath?: string;
}

export interface DiscoveredModel {
	id: string;
}

function trimToNull(value: string | undefined | null): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function legacyRoxHomeDirFor(roxHomeDir: string): string | null {
	const dirName = basename(roxHomeDir);
	if (dirName === "rox") {
		return join(dirname(roxHomeDir), ".rox");
	}
	if (dirName.startsWith("rox-")) {
		return join(dirname(roxHomeDir), `.${dirName}`);
	}
	return null;
}

export function getCustomProviderConfigPath(
	options?: CustomProviderConfigDiskOptions,
): string {
	if (options?.configPath) return options.configPath;
	const roxHome = process.env.ROX_HOME_DIR?.trim() || join(homedir(), "rox");
	return join(roxHome, CONFIG_FILE_NAME);
}

function getCustomProviderConfigReadPath(
	options?: CustomProviderConfigDiskOptions,
): string {
	const primaryPath = getCustomProviderConfigPath(options);
	if (options?.configPath || existsSync(primaryPath)) return primaryPath;

	const roxHome = process.env.ROX_HOME_DIR?.trim() || join(homedir(), "rox");
	const legacyHome = legacyRoxHomeDirFor(roxHome);
	if (!legacyHome) return primaryPath;

	const legacyPath = join(legacyHome, CONFIG_FILE_NAME);
	return existsSync(legacyPath) ? legacyPath : primaryPath;
}

/**
 * Normalize a base URL: trim, drop trailing slashes, require an absolute
 * http(s) URL. Returns null when the value is empty or unparseable so callers
 * can surface a clear validation error rather than persisting garbage.
 */
export function normalizeCustomProviderBaseUrl(
	rawBaseUrl: string | undefined | null,
): string | null {
	const baseUrl = trimToNull(rawBaseUrl);
	if (!baseUrl) return null;

	try {
		const parsed = new URL(baseUrl);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}
		return parsed.toString().replace(/\/+$/, "");
	} catch {
		return null;
	}
}

/**
 * Strip the custom-provider prefix so the stored model id is always bare. The
 * runtime re-adds the prefix when handing the id to mastracode. Stays tolerant
 * of a stray legacy `openai/` prefix so pre-migration selections still resolve.
 */
export function stripCustomProviderPrefix(modelId: string): string {
	const lower = modelId.toLowerCase();
	if (lower.startsWith(CUSTOM_PROVIDER_PREFIX)) {
		return modelId.slice(CUSTOM_PROVIDER_PREFIX.length);
	}
	if (lower.startsWith(LEGACY_OPENAI_PROVIDER_PREFIX)) {
		return modelId.slice(LEGACY_OPENAI_PROVIDER_PREFIX.length);
	}
	return modelId;
}

/**
 * The wire model id the harness needs for a custom model: `rox-custom/<modelId>`.
 * The slug selects mastracode's registered custom provider, which routes the
 * bare id through its OpenAI-compatible chat-completions client.
 */
export function toCustomProviderWireModelId(modelId: string): string {
	return `${CUSTOM_PROVIDER_PREFIX}${stripCustomProviderPrefix(modelId.trim())}`;
}

function normalizeModelList(rawModels: unknown): string[] {
	if (!Array.isArray(rawModels)) return [];
	const seen = new Set<string>();
	const models: string[] = [];
	for (const entry of rawModels) {
		const id = trimToNull(typeof entry === "string" ? entry : undefined);
		if (!id) continue;
		const bare = stripCustomProviderPrefix(id);
		if (seen.has(bare)) continue;
		seen.add(bare);
		models.push(bare);
	}
	return models;
}

function readPersistedCustomProviderConfig(
	options?: CustomProviderConfigDiskOptions,
): PersistedCustomProviderConfig | null {
	const configPath = getCustomProviderConfigReadPath(options);
	if (!existsSync(configPath)) return null;

	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as {
			version?: unknown;
			baseUrl?: unknown;
			apiKey?: unknown;
			models?: unknown;
			defaultModelId?: unknown;
			modelId?: unknown;
		};

		// v2: the current shape.
		if (
			parsed.version === 2 &&
			typeof parsed.baseUrl === "string" &&
			typeof parsed.apiKey === "string"
		) {
			const models = normalizeModelList(parsed.models);
			const rawDefault =
				typeof parsed.defaultModelId === "string"
					? trimToNull(parsed.defaultModelId)
					: null;
			const defaultModelId = rawDefault
				? stripCustomProviderPrefix(rawDefault)
				: null;
			return {
				version: 2,
				baseUrl: parsed.baseUrl,
				apiKey: parsed.apiKey,
				models,
				defaultModelId,
			};
		}

		// v1: migrate `{ modelId }` → `{ models: [modelId], defaultModelId }`.
		if (
			parsed.version === 1 &&
			typeof parsed.baseUrl === "string" &&
			typeof parsed.apiKey === "string" &&
			typeof parsed.modelId === "string"
		) {
			const bare = stripCustomProviderPrefix(parsed.modelId);
			const models = normalizeModelList([bare]);
			return {
				version: 2,
				baseUrl: parsed.baseUrl,
				apiKey: parsed.apiKey,
				models,
				defaultModelId: models[0] ?? null,
			};
		}

		return null;
	} catch (error) {
		console.warn(
			"[chat-service][custom-provider] Failed to read persisted config.",
			{
				configPath,
				error: error instanceof Error ? error.message : String(error),
			},
		);
		return null;
	}
}

export function getCustomProviderConfig(
	options?: CustomProviderConfigDiskOptions,
): CustomProviderConfig | null {
	const persisted = readPersistedCustomProviderConfig(options);
	if (!persisted) return null;

	const baseUrl = normalizeCustomProviderBaseUrl(persisted.baseUrl);
	const apiKey = trimToNull(persisted.apiKey);
	if (!baseUrl || !apiKey) return null;

	const models = normalizeModelList(persisted.models);
	const defaultModelId =
		persisted.defaultModelId && models.includes(persisted.defaultModelId)
			? persisted.defaultModelId
			: null;

	return {
		baseUrl,
		apiKey,
		models,
		defaultModelId,
	};
}

/**
 * Read just the persisted API key (or null when nothing is stored). The renderer
 * never receives the raw key back, so save/discover reuse the stored secret when
 * the user leaves the key field blank after an earlier save — otherwise editing
 * only the base URL would force re-entering the key on every change, which makes
 * the saved key feel like it was never remembered.
 */
export function getStoredCustomProviderApiKey(
	options?: CustomProviderConfigDiskOptions,
): string | null {
	const persisted = readPersistedCustomProviderConfig(options);
	if (!persisted) return null;
	return trimToNull(persisted.apiKey);
}

export interface SetCustomProviderConfigInput {
	baseUrl: string;
	/**
	 * New API key. Omit (or pass blank) to keep the previously saved key — the
	 * stored secret is reused for model/base-URL-only edits.
	 */
	apiKey?: string;
	/** The full discovered model list to persist (bare ids). */
	models: string[];
	/** Optional preferred default model id (bare). */
	defaultModelId?: string | null;
}

export function setCustomProviderConfig(
	input: SetCustomProviderConfigInput,
	options?: CustomProviderConfigDiskOptions,
): CustomProviderConfig {
	const baseUrl = normalizeCustomProviderBaseUrl(input.baseUrl);
	if (!baseUrl) {
		throw new Error("Укажите корректный Base URL (http(s)://…).");
	}
	// Reuse the persisted key when the caller omits one, so an existing provider
	// can be re-pointed at a new base URL/model list without re-entering the secret.
	const apiKey =
		trimToNull(input.apiKey) ?? getStoredCustomProviderApiKey(options);
	if (!apiKey) {
		throw new Error("Укажите ключ API.");
	}

	const models = normalizeModelList(input.models);
	const requestedDefault = trimToNull(input.defaultModelId ?? null);
	const defaultModelId =
		requestedDefault &&
		models.includes(stripCustomProviderPrefix(requestedDefault))
			? stripCustomProviderPrefix(requestedDefault)
			: null;

	const configPath = getCustomProviderConfigPath(options);
	mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });

	const persisted: PersistedCustomProviderConfig = {
		version: 2,
		baseUrl,
		apiKey,
		models,
		defaultModelId,
	};
	writeFileSync(configPath, JSON.stringify(persisted, null, 2), "utf-8");
	chmodSync(configPath, 0o600);

	const config: CustomProviderConfig = {
		baseUrl: persisted.baseUrl,
		apiKey: persisted.apiKey,
		models: persisted.models,
		defaultModelId: persisted.defaultModelId,
	};

	// Register the provider with mastracode so the harness routes the wire id
	// `<slug>/<modelId>` through its OpenAI-compatible chat-completions client.
	syncMastracodeCustomProviderSettings(config, {
		mastracodeSettingsPath: options?.mastracodeSettingsPath,
	});

	return config;
}

export function clearCustomProviderConfig(
	options?: CustomProviderConfigDiskOptions,
): void {
	const configPath = getCustomProviderConfigPath(options);
	rmSync(configPath, { force: true });
	// Reads fall back to a legacy `.rox`-located config, so a clear that removed
	// only the primary file would leave a half-removed state (the UI would still
	// see the provider as configured). Remove the legacy copy too. Skipped when an
	// explicit configPath is injected (tests), which has no legacy fallback.
	if (!options?.configPath) {
		const roxHome = process.env.ROX_HOME_DIR?.trim() || join(homedir(), "rox");
		const legacyHome = legacyRoxHomeDirFor(roxHome);
		if (legacyHome) {
			rmSync(join(legacyHome, CONFIG_FILE_NAME), { force: true });
		}
	}
	// Remove the mastracode registration so a stale provider entry never lingers.
	syncMastracodeCustomProviderSettings(null, {
		mastracodeSettingsPath: options?.mastracodeSettingsPath,
	});
}

/**
 * Resolve mastracode's global `settings.json` path, replicating
 * `getAppDataDir()` from the bundled mastracode source:
 *   - macOS:   ~/Library/Application Support/mastracode/settings.json
 *   - Windows: %APPDATA%/mastracode/settings.json
 *   - Linux:   $XDG_DATA_HOME or ~/.local/share/mastracode/settings.json
 */
export function getMastracodeSettingsPath(
	options?: Pick<CustomProviderConfigDiskOptions, "mastracodeSettingsPath">,
): string {
	if (options?.mastracodeSettingsPath) return options.mastracodeSettingsPath;

	const os = platform();
	let baseDir: string;
	if (os === "darwin") {
		baseDir = join(homedir(), "Library", "Application Support");
	} else if (os === "win32") {
		baseDir =
			process.env.APPDATA?.trim() || join(homedir(), "AppData", "Roaming");
	} else {
		baseDir =
			process.env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
	}
	return join(baseDir, "mastracode", "settings.json");
}

interface MastracodeCustomProviderEntry {
	name: string;
	url: string;
	apiKey?: string;
	models: string[];
}

interface MastracodeSettingsShape {
	customProviders?: unknown;
	[key: string]: unknown;
}

/**
 * Register (or remove) Rox's custom provider in mastracode's global
 * `settings.json`. This is the cross-process bridge that makes the harness route
 * `<slug>/<modelId>` through `createOpenAICompatible().chatModel()`
 * (`/chat/completions`) instead of the `openai/*` Responses path.
 *
 * Atomic read-modify-write (temp file + rename). Preserves all other settings
 * keys and any other `customProviders` entries; dedupes our entry by slug.
 */
export function syncMastracodeCustomProviderSettings(
	config: CustomProviderConfig | null,
	options?: Pick<CustomProviderConfigDiskOptions, "mastracodeSettingsPath">,
): void {
	const settingsPath = getMastracodeSettingsPath(options);

	let settings: MastracodeSettingsShape = {};
	if (existsSync(settingsPath)) {
		try {
			const parsed = JSON.parse(readFileSync(settingsPath, "utf-8")) as unknown;
			if (parsed && typeof parsed === "object") {
				settings = parsed as MastracodeSettingsShape;
			}
		} catch (error) {
			console.warn(
				"[chat-service][custom-provider] Failed to read mastracode settings; rewriting.",
				{
					settingsPath,
					error: error instanceof Error ? error.message : String(error),
				},
			);
			settings = {};
		}
	}

	const existingProviders = Array.isArray(settings.customProviders)
		? (settings.customProviders as MastracodeCustomProviderEntry[])
		: [];

	// Drop any prior entry that slugs to our reserved slug, keep the rest intact.
	const preserved = existingProviders.filter((provider) => {
		const name =
			provider &&
			typeof provider === "object" &&
			typeof provider.name === "string"
				? provider.name
				: "";
		return customProviderSlug(name) !== CUSTOM_PROVIDER_SLUG;
	});

	let nextProviders = preserved;
	if (config && config.models.length > 0) {
		const entry: MastracodeCustomProviderEntry = {
			name: CUSTOM_PROVIDER_NAME,
			url: config.baseUrl,
			apiKey: config.apiKey,
			models: [...config.models],
		};
		nextProviders = [...preserved, entry];
	}

	settings.customProviders = nextProviders;

	mkdirSync(dirname(settingsPath), { recursive: true });
	const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(tempPath, JSON.stringify(settings, null, 2), "utf-8");
	renameSync(tempPath, settingsPath);
}

interface OpenAIModelsListResponse {
	data?: Array<{ id?: unknown }>;
}

/**
 * Call `GET {baseUrl}/models` (OpenAI-compatible) and return the discovered
 * model ids. Tolerant of the common response shapes: `{ data: [{ id }] }`
 * (OpenAI) and a bare `[{ id }]` array (some compatible servers).
 */
export async function discoverCustomProviderModels(input: {
	baseUrl: string;
	apiKey: string;
	fetchImpl?: typeof fetch;
	signal?: AbortSignal;
}): Promise<DiscoveredModel[]> {
	const baseUrl = normalizeCustomProviderBaseUrl(input.baseUrl);
	if (!baseUrl) {
		throw new Error("Укажите корректный Base URL (http(s)://…).");
	}
	const apiKey = trimToNull(input.apiKey);
	if (!apiKey) {
		throw new Error("Укажите ключ API.");
	}

	const fetchImpl = input.fetchImpl ?? fetch;
	// Try `${baseUrl}/models` first. Many OpenAI-compatible servers live under a
	// `/v1` prefix, so when the user pastes the bare host (no `/v1`) the first
	// call 404s — fall back to `${baseUrl}/v1/models` before giving up. A base
	// URL that already ends in `/vN` only ever tries that single correct path.
	const candidates = [`${baseUrl}/models`];
	if (!/\/v\d+$/i.test(baseUrl)) {
		candidates.push(`${baseUrl}/v1/models`);
	}

	let response: Response | null = null;
	let lastError = "";
	for (const url of candidates) {
		if (input.signal?.aborted) break;
		try {
			const attempt = await fetchImpl(url, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					Accept: "application/json",
				},
				signal: input.signal,
			});
			if (attempt.ok) {
				response = attempt;
				break;
			}
			lastError = `${url} → ${attempt.status} ${attempt.statusText}`;
		} catch (error) {
			lastError = `${url} → ${
				error instanceof Error ? error.message : String(error)
			}`;
			if (input.signal?.aborted) break;
		}
	}

	if (!response) {
		throw new Error(
			`Не удалось получить список моделей (${lastError || "нет ответа"}). Проверьте Base URL и ключ API.`,
		);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new Error("Эндпоинт моделей вернул некорректный JSON.");
	}

	const rawModels = Array.isArray(payload)
		? payload
		: ((payload as OpenAIModelsListResponse)?.data ?? []);

	const seen = new Set<string>();
	const models: DiscoveredModel[] = [];
	for (const entry of rawModels) {
		const id =
			typeof entry === "object" && entry !== null
				? trimToNull((entry as { id?: unknown }).id as string | undefined)
				: null;
		if (!id || seen.has(id)) continue;
		seen.add(id);
		models.push({ id });
	}

	models.sort((a, b) => a.id.localeCompare(b.id));
	return models;
}
