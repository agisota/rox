import type { AiProviderKind } from "@rox/db/enums";

export interface AIProvider {
	readonly kind: AiProviderKind;
	embed(texts: string[]): Promise<number[][]>;
}

export interface HttpEmbedderOptions {
	endpoint: string;
	kind?: AiProviderKind;
	fetchImpl?: FetchLike;
}

type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

const DEFAULT_EMBEDDER_TIMEOUT_MS = 10_000;
const DEFAULT_EMBEDDER_RETRIES = 2;

function retryDelayMs(attempt: number): number {
	return 100 * 2 ** attempt;
}

function isRetryableStatus(status: number): boolean {
	return status === 429 || status >= 500;
}

async function fetchWithRetry(
	fetcher: FetchLike,
	input: string,
	init: RequestInit,
): Promise<Response> {
	let lastError: unknown;
	for (let attempt = 0; attempt <= DEFAULT_EMBEDDER_RETRIES; attempt += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			DEFAULT_EMBEDDER_TIMEOUT_MS,
		);
		try {
			const res = await fetcher(input, { ...init, signal: controller.signal });
			if (attempt < DEFAULT_EMBEDDER_RETRIES && isRetryableStatus(res.status)) {
				await res.body?.cancel().catch(() => undefined);
				await new Promise((resolve) =>
					setTimeout(resolve, retryDelayMs(attempt)),
				);
				continue;
			}
			return res;
		} catch (error) {
			lastError = error;
			if (attempt >= DEFAULT_EMBEDDER_RETRIES) break;
			await new Promise((resolve) =>
				setTimeout(resolve, retryDelayMs(attempt)),
			);
		} finally {
			clearTimeout(timeout);
		}
	}
	throw lastError instanceof Error
		? lastError
		: new Error("Embedder request failed");
}

export function createHttpEmbedder(options: HttpEmbedderOptions): AIProvider {
	const fetcher = options.fetchImpl ?? fetch;
	const endpoint = options.endpoint.replace(/\/$/, "");

	return {
		kind: options.kind ?? "local",
		async embed(texts) {
			if (texts.length === 0) return [];
			const res = await fetchWithRetry(fetcher, `${endpoint}/embed`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ texts }),
			});
			if (!res.ok) {
				const body = await res.text().catch(() => "");
				throw new Error(`Embedder request failed: ${res.status} ${body}`);
			}
			const json = (await res.json()) as { embeddings?: number[][] };
			return json.embeddings ?? [];
		},
	};
}
