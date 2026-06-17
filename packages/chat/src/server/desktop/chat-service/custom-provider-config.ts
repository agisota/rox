import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

/**
 * Persistence + discovery for a user-supplied, OpenAI-compatible "custom"
 * provider. The user enters a base URL + API key; the app discovers available
 * models by calling `GET {baseUrl}/models` (the OpenAI list-models surface) and
 * lets the user pick one. The selected model is routed through mastracode's
 * OpenAI-compatible client (`OPENAI_BASE_URL` + `OPENAI_API_KEY`), exactly like
 * the Rox house model, so no new provider adapter is required.
 *
 * Config lives on disk under `ROX_HOME_DIR` so the long-lived desktop
 * `ChatService` (which owns settings reads/writes) and the host-service
 * `LocalModelProvider` (which injects runtime env) read the same source of
 * truth across processes — the same anchor the Anthropic env config uses.
 */

const CONFIG_FILE_NAME = "chat-custom-provider.json";

/** Provider prefix that routes a model through the OpenAI-compatible client. */
const OPENAI_PROVIDER_PREFIX = "openai/";

export interface CustomProviderConfig {
	/** OpenAI-compatible base URL, e.g. `https://api.example.com/v1`. */
	baseUrl: string;
	/** API key sent as `Authorization: Bearer <apiKey>`. */
	apiKey: string;
	/** Bare model id the user picked from discovery (e.g. `llama-3.3-70b`). */
	modelId: string;
}

export interface PersistedCustomProviderConfig {
	version: 1;
	baseUrl: string;
	apiKey: string;
	modelId: string;
}

export interface CustomProviderConfigDiskOptions {
	configPath?: string;
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
 * Strip any `openai/` prefix so the stored model id is always bare. The runtime
 * re-adds the prefix when handing the id to mastracode.
 */
export function stripOpenAIProviderPrefix(modelId: string): string {
	return modelId.startsWith(OPENAI_PROVIDER_PREFIX)
		? modelId.slice(OPENAI_PROVIDER_PREFIX.length)
		: modelId;
}

/**
 * The wire model id the harness needs for a custom model: `openai/<modelId>`.
 * The `openai/` prefix selects mastracode's OpenAI-compatible client; mastracode
 * strips it before calling the endpoint, so the upstream receives the bare id.
 */
export function toCustomProviderWireModelId(modelId: string): string {
	return `${OPENAI_PROVIDER_PREFIX}${stripOpenAIProviderPrefix(modelId.trim())}`;
}

function readPersistedCustomProviderConfig(
	options?: CustomProviderConfigDiskOptions,
): PersistedCustomProviderConfig | null {
	const configPath = getCustomProviderConfigReadPath(options);
	if (!existsSync(configPath)) return null;

	try {
		const parsed = JSON.parse(
			readFileSync(configPath, "utf-8"),
		) as Partial<PersistedCustomProviderConfig>;
		if (
			parsed.version !== 1 ||
			typeof parsed.baseUrl !== "string" ||
			typeof parsed.apiKey !== "string" ||
			typeof parsed.modelId !== "string"
		) {
			return null;
		}
		return {
			version: 1,
			baseUrl: parsed.baseUrl,
			apiKey: parsed.apiKey,
			modelId: parsed.modelId,
		};
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
	const modelId = trimToNull(persisted.modelId);
	if (!baseUrl || !apiKey || !modelId) return null;

	return {
		baseUrl,
		apiKey,
		modelId: stripOpenAIProviderPrefix(modelId),
	};
}

/**
 * Read just the persisted API key (or null when nothing is stored). The renderer
 * never receives the raw key back, so save/discover reuse the stored secret when
 * the user leaves the key field blank after an earlier save — otherwise editing
 * only the model or base URL would force re-entering the key on every change,
 * which makes the saved key feel like it was never remembered.
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
	modelId: string;
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
	// can be re-pointed at a new model/base URL without re-entering the secret.
	const apiKey =
		trimToNull(input.apiKey) ?? getStoredCustomProviderApiKey(options);
	if (!apiKey) {
		throw new Error("Укажите ключ API.");
	}
	const modelId = trimToNull(input.modelId);
	if (!modelId) {
		throw new Error("Выберите модель.");
	}

	const configPath = getCustomProviderConfigPath(options);
	mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });

	const persisted: PersistedCustomProviderConfig = {
		version: 1,
		baseUrl,
		apiKey,
		modelId: stripOpenAIProviderPrefix(modelId),
	};
	writeFileSync(configPath, JSON.stringify(persisted, null, 2), "utf-8");
	chmodSync(configPath, 0o600);

	return {
		baseUrl: persisted.baseUrl,
		apiKey: persisted.apiKey,
		modelId: persisted.modelId,
	};
}

export function clearCustomProviderConfig(
	options?: CustomProviderConfigDiskOptions,
): void {
	const configPath = getCustomProviderConfigPath(options);
	rmSync(configPath, { force: true });
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
