/**
 * Qdrant-compatible vector-store contract (#02).
 */

export interface VectorPoint {
	id: string;
	vector: number[];
	payload: Record<string, unknown>;
}

export interface VectorSearchHit {
	id: string;
	score: number;
	payload: Record<string, unknown>;
}

export interface VectorStore {
	ensureCollection(name: string, dim: number): Promise<void>;
	upsert(name: string, points: VectorPoint[]): Promise<void>;
	search(
		name: string,
		vector: number[],
		filter: Record<string, unknown>,
		limit: number,
		scoreThreshold?: number,
	): Promise<VectorSearchHit[]>;
	delete(name: string, ids: string[]): Promise<void>;
}

export interface QdrantVectorStoreOptions {
	endpoint: string;
	apiKey?: string;
	fetchImpl?: FetchLike;
}

type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

const DEFAULT_QDRANT_TIMEOUT_MS = 10_000;
const DEFAULT_QDRANT_RETRIES = 2;

function retryDelayMs(attempt: number): number {
	return 100 * 2 ** attempt;
}

function isRetryableStatus(status: number): boolean {
	return status === 429 || status >= 500;
}

export function createQdrantVectorStore(
	options: QdrantVectorStoreOptions,
): VectorStore {
	const fetcher = options.fetchImpl ?? fetch;
	const baseUrl = options.endpoint.replace(/\/$/, "");
	const headers = (): Record<string, string> => ({
		"content-type": "application/json",
		...(options.apiKey ? { "api-key": options.apiKey } : {}),
	});
	const collectionPath = (name: string): string =>
		`/collections/${encodeURIComponent(name)}`;

	async function fetchWithRetry(
		path: string,
		init: RequestInit = {},
	): Promise<Response> {
		let lastError: unknown;
		for (let attempt = 0; attempt <= DEFAULT_QDRANT_RETRIES; attempt += 1) {
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				DEFAULT_QDRANT_TIMEOUT_MS,
			);
			try {
				const res = await fetcher(`${baseUrl}${path}`, {
					...init,
					signal: controller.signal,
					headers: {
						...headers(),
						...(init.headers as Record<string, string> | undefined),
					},
				});
				if (attempt < DEFAULT_QDRANT_RETRIES && isRetryableStatus(res.status)) {
					await res.body?.cancel().catch(() => undefined);
					await new Promise((resolve) =>
						setTimeout(resolve, retryDelayMs(attempt)),
					);
					continue;
				}
				return res;
			} catch (error) {
				lastError = error;
				if (attempt >= DEFAULT_QDRANT_RETRIES) break;
				await new Promise((resolve) =>
					setTimeout(resolve, retryDelayMs(attempt)),
				);
			} finally {
				clearTimeout(timeout);
			}
		}
		throw lastError instanceof Error
			? lastError
			: new Error("Qdrant request failed");
	}

	async function request<T>(
		path: string,
		init: RequestInit = {},
		allowedStatuses: number[] = [200],
	): Promise<T> {
		const res = await fetchWithRetry(path, init);
		if (!allowedStatuses.includes(res.status)) {
			const body = await res.text().catch(() => "");
			throw new Error(`Qdrant request failed: ${res.status} ${body}`);
		}
		if (res.status === 204) return undefined as T;
		return (await res.json()) as T;
	}

	return {
		async ensureCollection(name, dim) {
			const path = collectionPath(name);
			const existing = await fetchWithRetry(path);
			if (existing.status === 200) return;
			if (existing.status !== 404) {
				throw new Error(`Qdrant collection check failed: ${existing.status}`);
			}
			await request(path, {
				method: "PUT",
				body: JSON.stringify({
					vectors: { size: dim, distance: "Cosine" },
				}),
			});
		},
		async upsert(name, points) {
			if (points.length === 0) return;
			await request(`${collectionPath(name)}/points?wait=true`, {
				method: "PUT",
				body: JSON.stringify({ points }),
			});
		},
		async search(name, vector, filter, limit, scoreThreshold) {
			const response = await request<{
				result?: Array<{
					id: string | number;
					score: number;
					payload?: Record<string, unknown>;
				}>;
			}>(`${collectionPath(name)}/points/search`, {
				method: "POST",
				body: JSON.stringify({
					vector,
					filter,
					limit,
					score_threshold: scoreThreshold,
					with_payload: true,
				}),
			});
			return (response.result ?? []).map((hit) => ({
				id: String(hit.id),
				score: hit.score,
				payload: hit.payload ?? {},
			}));
		},
		async delete(name, ids) {
			if (ids.length === 0) return;
			await request(`${collectionPath(name)}/points/delete?wait=true`, {
				method: "POST",
				body: JSON.stringify({ points: ids }),
			});
		},
	};
}
