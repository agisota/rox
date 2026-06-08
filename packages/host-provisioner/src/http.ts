import type { FetchLike } from "./types";

/** Default ephemeral sandbox lifetime: ~1 hour. */
export const DEFAULT_SANDBOX_TTL_MS = 60 * 60 * 1000;

export class ProvisionerError extends Error {
	readonly status: number;
	readonly body: string;

	constructor(message: string, status: number, body: string) {
		super(message);
		this.name = "ProvisionerError";
		this.status = status;
		this.body = body;
	}
}

/**
 * Minimal JSON request helper shared by the adapters. Throws
 * {@link ProvisionerError} on non-2xx so callers get the status + body.
 */
export async function jsonRequest<T>(
	fetchImpl: FetchLike,
	url: string,
	init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
	const { body, headers, ...rest } = init;
	const res = await fetchImpl(url, {
		...rest,
		headers: {
			"content-type": "application/json",
			...(headers as Record<string, string> | undefined),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new ProvisionerError(
			`Provisioner request failed (${res.status}) for ${url}`,
			res.status,
			text,
		);
	}

	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

/** Resolve the fetch implementation, falling back to the global. */
export function resolveFetch(fetchImpl?: FetchLike): FetchLike {
	if (fetchImpl) return fetchImpl;
	if (typeof fetch === "function") return fetch as FetchLike;
	throw new Error("No fetch implementation available");
}
