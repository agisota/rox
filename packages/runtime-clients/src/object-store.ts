/**
 * Runtime object-store contract (#02).
 *
 * Credentials are intentionally outside this interface. Callers resolve secrets
 * from env/secret-store and inject a concrete S3/minio implementation.
 */

export interface ObjectStoreHead {
	size: number;
	mime?: string;
	etag?: string;
}

export interface ObjectStore {
	presignPut(
		bucket: string,
		key: string,
		ttlSec: number,
		mime?: string,
	): Promise<string>;
	presignGet(bucket: string, key: string, ttlSec: number): Promise<string>;
	head(bucket: string, key: string): Promise<ObjectStoreHead | null>;
	delete(bucket: string, key: string): Promise<void>;
	ensureBucket(bucket: string): Promise<void>;
}

export interface UrlObjectStoreOptions {
	endpoint: string;
	fetchImpl?: FetchLike;
}

type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

const DEFAULT_OBJECT_REQUEST_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(
	fetcher: FetchLike,
	input: string,
	init: RequestInit,
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		DEFAULT_OBJECT_REQUEST_TIMEOUT_MS,
	);
	try {
		return await fetcher(input, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timeout);
	}
}

export function createUrlObjectStore(
	options: UrlObjectStoreOptions,
): ObjectStore {
	const endpoint = options.endpoint.replace(/\/$/, "");
	const fetcher = options.fetchImpl ?? fetch;

	function url(bucket: string, key: string): string {
		const encodedKey = key.split("/").map(encodeURIComponent).join("/");
		return `${endpoint}/${encodeURIComponent(bucket)}/${encodedKey}`;
	}

	return {
		async presignPut(bucket, key, _ttlSec, _mime) {
			// URL-mode is a development adapter; real S3 adapters enforce TTL/mime.
			return url(bucket, key);
		},
		async presignGet(bucket, key, _ttlSec) {
			return url(bucket, key);
		},
		async head(bucket, key) {
			const res = await fetchWithTimeout(fetcher, url(bucket, key), {
				method: "HEAD",
			});
			if (res.status === 404) return null;
			if (!res.ok) {
				throw new Error(`Object head failed: ${res.status}`);
			}
			const size = Number(res.headers.get("content-length") ?? 0);
			return {
				size,
				mime: res.headers.get("content-type") ?? undefined,
				etag: res.headers.get("etag") ?? undefined,
			};
		},
		async delete(bucket, key) {
			const res = await fetchWithTimeout(fetcher, url(bucket, key), {
				method: "DELETE",
			});
			if (!res.ok && res.status !== 404) {
				throw new Error(`Object delete failed: ${res.status}`);
			}
		},
		async ensureBucket() {
			// URL-mode adapters rely on the runtime supervisor to provision buckets.
		},
	};
}

export function objectKey(
	prefix: string,
	id: string,
	filename?: string,
): string {
	const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
	const cleanName = filename?.replace(/^\/+|\/+$/g, "");
	return cleanName
		? `${cleanPrefix}/${id}/${cleanName}`
		: `${cleanPrefix}/${id}`;
}
