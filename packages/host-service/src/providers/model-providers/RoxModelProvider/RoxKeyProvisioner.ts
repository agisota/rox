import {
	ROX_AI_API_KEY_ENV,
	ROX_KEY_PROVISION_TOKEN_ENV,
	ROX_KEY_PROVISION_URL_ENV,
} from "@rox/shared/chat-models";

/**
 * Resolves a per-user Rox API key for the OpenAI-compatible chat endpoint
 * ({@link ROX_AI_BASE_URL}).
 *
 * Resolution order:
 *   1. A statically-provided key in `process.env[ROX_AI_API_KEY_ENV]` (escape
 *      hatch for local dev / single-user hosts).
 *   2. A per-user key minted/fetched from a provisioning endpoint
 *      (`ROX_KEY_PROVISION_URL` + bearer `ROX_KEY_PROVISION_TOKEN`), cached
 *      per user id for the process lifetime.
 *
 * Secrets are never logged. Failures surface as a typed result so callers can
 * decide whether to degrade gracefully (e.g. fall back to another provider)
 * rather than crash the runtime.
 */

export type RoxKeyResolution =
	| { kind: "ok"; apiKey: string; source: "env" | "provisioned" }
	| { kind: "unconfigured" }
	| { kind: "error"; message: string };

export interface RoxKeyProvisionerOptions {
	/** Env source. Defaults to `process.env`. Injected for tests. */
	env?: () => Record<string, string | undefined>;
	/** `fetch` implementation. Defaults to global `fetch`. Injected for tests. */
	fetchImpl?: typeof fetch;
	/** Network timeout for a provisioning call, in ms. */
	timeoutMs?: number;
}

interface ProvisionResponseShape {
	apiKey?: unknown;
	api_key?: unknown;
	key?: unknown;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function trimToNull(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function extractApiKey(payload: unknown): string | null {
	if (typeof payload === "string") return trimToNull(payload);
	if (typeof payload !== "object" || payload === null) return null;
	const shape = payload as ProvisionResponseShape;
	return (
		trimToNull(shape.apiKey) ??
		trimToNull(shape.api_key) ??
		trimToNull(shape.key)
	);
}

export class RoxKeyProvisioner {
	private readonly env: () => Record<string, string | undefined>;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;
	/** Per-user provisioned keys, cached for the process lifetime. */
	private readonly provisionedKeys = new Map<string, string>();
	/** De-dupes concurrent provisioning calls for the same user. */
	private readonly inflight = new Map<string, Promise<RoxKeyResolution>>();

	constructor(options?: RoxKeyProvisionerOptions) {
		this.env =
			options?.env ?? (() => process.env as Record<string, string | undefined>);
		this.fetchImpl = options?.fetchImpl ?? globalThis.fetch;
		this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	/** True when either a static key or a provisioning endpoint is configured. */
	isConfigured(): boolean {
		const env = this.env();
		return Boolean(
			trimToNull(env[ROX_AI_API_KEY_ENV]) ??
				trimToNull(env[ROX_KEY_PROVISION_URL_ENV]),
		);
	}

	/**
	 * Resolve a usable Rox key for `userId`. A static env key short-circuits
	 * provisioning. Provisioned keys are cached per user; concurrent calls share
	 * one in-flight request.
	 */
	async resolveKey(userId: string): Promise<RoxKeyResolution> {
		const env = this.env();

		const staticKey = trimToNull(env[ROX_AI_API_KEY_ENV]);
		if (staticKey) {
			return { kind: "ok", apiKey: staticKey, source: "env" };
		}

		const cached = this.provisionedKeys.get(userId);
		if (cached) {
			return { kind: "ok", apiKey: cached, source: "provisioned" };
		}

		const provisionUrl = trimToNull(env[ROX_KEY_PROVISION_URL_ENV]);
		if (!provisionUrl) {
			return { kind: "unconfigured" };
		}

		const existing = this.inflight.get(userId);
		if (existing) return existing;

		const promise = this.provisionKey(userId, provisionUrl).finally(() => {
			this.inflight.delete(userId);
		});
		this.inflight.set(userId, promise);
		return promise;
	}

	private async provisionKey(
		userId: string,
		provisionUrl: string,
	): Promise<RoxKeyResolution> {
		const token = trimToNull(this.env()[ROX_KEY_PROVISION_TOKEN_ENV]);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await this.fetchImpl(provisionUrl, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...(token ? { authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify({ userId }),
				signal: controller.signal,
			});

			if (!response.ok) {
				return {
					kind: "error",
					message: `Rox key provisioning failed: HTTP ${response.status}`,
				};
			}

			const payload = (await response.json().catch(() => null)) as unknown;
			const apiKey = extractApiKey(payload);
			if (!apiKey) {
				return {
					kind: "error",
					message:
						"Rox key provisioning returned no usable key (expected { apiKey } in the JSON body)",
				};
			}

			this.provisionedKeys.set(userId, apiKey);
			return { kind: "ok", apiKey, source: "provisioned" };
		} catch (error) {
			const reason =
				error instanceof Error && error.name === "AbortError"
					? "request timed out"
					: error instanceof Error
						? error.message
						: "unknown error";
			return {
				kind: "error",
				message: `Rox key provisioning failed: ${reason}`,
			};
		} finally {
			clearTimeout(timeout);
		}
	}
}
