import type {
	HttpRequestInput,
	HttpResponseResult,
} from "@rox/workflow-runtime/handlers";

/**
 * Real HTTP port for the `http_request` block. Lives here (not in
 * `@rox/workflow-runtime`) so the executor stays fetch/SDK-free — the runtime
 * only sees the injected port. Uses the platform's global `fetch` with an
 * `AbortController`-backed timeout; it does not introduce a new HTTP client.
 *
 * The handler has already run the SSRF guard and resolved any secret auth header
 * before the request reaches this port; this function performs the bare call and
 * normalizes the response (status, header map, text body).
 */
export async function pipelineHttpRequest(
	req: HttpRequestInput,
): Promise<HttpResponseResult> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), req.timeoutMs);
	try {
		const response = await fetch(req.url, {
			method: req.method,
			headers: req.headers,
			body: req.body,
			signal: controller.signal,
			// Never auto-follow into a redirected (possibly internal) target without
			// re-checking; surface the 3xx to the caller instead.
			redirect: "manual",
		});

		const headers: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			headers[key] = value;
		});

		return {
			status: response.status,
			headers,
			body: await response.text(),
		};
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			throw new Error(`HTTP request timed out after ${req.timeoutMs}ms`);
		}
		throw err;
	} finally {
		clearTimeout(timer);
	}
}
