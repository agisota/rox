import ipaddr from "ipaddr.js";
import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { resolvePromptTemplate } from "./modelHandler";

/**
 * Request handed to the injected HTTP port for an `http_request` block. Kept
 * transport-agnostic so `@rox/workflow-runtime` stays fetch/SDK-free: the
 * run-service wires the real port (native `fetch` + AbortController in
 * `@rox/trpc`), unit tests inject a fake. The handler has already substituted
 * `{{path}}` placeholders and resolved any secret-bearing auth header before the
 * request reaches the port — the port performs the bare network call.
 */
export interface HttpRequestInput {
	method: string;
	url: string;
	headers: Record<string, string>;
	/** Serialized request body, or undefined for bodyless methods. */
	body?: string;
	/** Per-request timeout in milliseconds. */
	timeoutMs: number;
}

export interface HttpResponseResult {
	status: number;
	headers: Record<string, string>;
	/** Response body as text (parsed JSON lands downstream, not here). */
	body: string;
}

/**
 * Impure HTTP port: performs the bare network call. Injected by the run-service
 * so the executor stays fetch-free. Implementations should enforce the request
 * timeout and may throw on transport failure (the handler maps that to the
 * `error` handle).
 */
export type HttpRequestPort = (
	req: HttpRequestInput,
) => Promise<HttpResponseResult>;

const DEFAULT_TIMEOUT_MS = 30_000;
const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD"]);

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

/**
 * Substitute `{{path}}` placeholders against the merged upstream input in every
 * value of a `Record<string, string>` (header values, etc.). Reuses the single
 * template resolver shared with the model node so placeholder semantics stay
 * identical across node types.
 */
function resolveStringMap(
	map: Record<string, unknown>,
	input: Record<string, unknown>,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(map)) {
		const str = asString(value);
		if (str != null) out[key] = resolvePromptTemplate(str, input);
	}
	return out;
}

/**
 * SSRF guard: classify a hostname as a forbidden network target. Pure and
 * exported so it is unit-testable in isolation. Rejects the cloud metadata
 * endpoint, loopback, RFC1918 private ranges, link-local (incl. IPv6 fe80::/10),
 * unique-local IPv6 (fc00::/7), and IPv4-mapped IPv6 forms of the above.
 *
 * Note: this inspects the *literal host* in the URL. DNS-rebinding (a public
 * name resolving to a private address) is out of scope for the pure guard; the
 * impure port resolves and re-checks at connect time is a follow-up — here we
 * block the obvious literal-IP and `localhost` SSRF vectors before any request.
 */
export function isForbiddenHost(host: string): boolean {
	if (host.length === 0) return true;

	// Normalize bracketed IPv6 literals from a URL host (`[::1]` → `::1`).
	let candidate = host;
	if (candidate.startsWith("[") && candidate.endsWith("]")) {
		candidate = candidate.slice(1, -1);
	}

	const lower = candidate.toLowerCase();
	// `localhost` and any *.localhost subdomain resolve to loopback by convention.
	if (lower === "localhost" || lower.endsWith(".localhost")) return true;

	if (!ipaddr.isValid(candidate)) {
		// A non-IP hostname: allowed by the literal guard (DNS resolution + a
		// connect-time recheck in the port is the deeper defense). Names that are
		// obvious loopback aliases were caught above.
		return false;
	}

	let addr = ipaddr.parse(candidate);
	// Collapse IPv4-mapped/compat IPv6 (`::ffff:127.0.0.1`) to its IPv4 form so
	// the range check sees the real address family.
	if (addr.kind() === "ipv6") {
		const v6 = addr as ipaddr.IPv6;
		if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address();
	}

	const range = addr.range();
	// Permit only globally-routable unicast. Everything else (private, loopback,
	// linkLocal, uniqueLocal, carrierGradeNat, reserved, broadcast, multicast,
	// the IPv6 `unspecified`/`::`) is treated as an SSRF target.
	return range !== "unicast";
}

function hostFromUrl(url: URL): string {
	// `URL.hostname` strips the IPv6 brackets; re-add them so `isForbiddenHost`
	// can normalize uniformly and `ipaddr` parses the literal.
	return url.hostname.includes(":") ? `[${url.hostname}]` : url.hostname;
}

/**
 * Build the `http_request` block handler. Reads the node config from
 * `block.subBlocks` (method, url, headers, body, authRef, timeout), expands
 * `{{path}}` placeholders from the merged upstream input, resolves any secret
 * auth token via `ctx.resolveSecret` (never from the graph in cleartext), runs
 * the SSRF guard BEFORE touching the injected port, then delegates the bare call
 * to {@link HttpRequestPort}. Returns `{ output: { status, headers, body } }` on
 * a 2xx response or routes 4xx/5xx/timeout/transport failures to the `error`
 * handle.
 */
export function makeHttpHandler(request: HttpRequestPort): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const urlRaw = asString(sub.url);
		if (urlRaw == null || urlRaw.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "HTTP_URL_MISSING",
					message: "HTTP node has no URL configured (subBlocks.url).",
					blockId: ctx.blockId,
				},
			};
		}

		const method = (asString(sub.method) ?? "GET").toUpperCase();
		const urlStr = resolvePromptTemplate(urlRaw, ctx.input);

		let url: URL;
		try {
			url = new URL(urlStr);
		} catch {
			return {
				handle: "error",
				error: {
					code: "HTTP_URL_INVALID",
					message: `HTTP node URL is not a valid absolute URL: ${urlStr}`,
					blockId: ctx.blockId,
				},
			};
		}

		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return {
				handle: "error",
				error: {
					code: "HTTP_SCHEME_FORBIDDEN",
					message: `HTTP node only supports http(s); got ${url.protocol}`,
					blockId: ctx.blockId,
				},
			};
		}

		// SSRF guard runs BEFORE the port is ever invoked.
		if (isForbiddenHost(hostFromUrl(url))) {
			return {
				handle: "error",
				error: {
					code: "HTTP_SSRF_BLOCKED",
					message: `HTTP node target host is not allowed (private/loopback/link-local/metadata): ${url.hostname}`,
					blockId: ctx.blockId,
				},
			};
		}

		const headersRaw =
			sub.headers != null && typeof sub.headers === "object"
				? (sub.headers as Record<string, unknown>)
				: {};
		const headers = resolveStringMap(headersRaw, ctx.input);

		// Secret-bearing auth: resolve via the redacting secret store, never from
		// the graph in cleartext. `authRef` names the secret; the resolved value is
		// placed on the Authorization header and redacted from recorded steps.
		const authRef = asString(sub.authRef);
		if (authRef != null && authRef !== "") {
			const token = ctx.resolveSecret(authRef);
			if (token != null && token !== "") {
				headers.Authorization = token.startsWith("Bearer ")
					? token
					: `Bearer ${token}`;
			}
		}

		const bodyRaw = asString(sub.body);
		const body =
			bodyRaw != null && !METHODS_WITHOUT_BODY.has(method)
				? resolvePromptTemplate(bodyRaw, ctx.input)
				: undefined;

		const timeoutMs = asNumber(sub.timeout) ?? DEFAULT_TIMEOUT_MS;

		let res: HttpResponseResult;
		try {
			res = await request({
				method,
				url: url.toString(),
				headers,
				body,
				timeoutMs,
			});
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "HTTP_REQUEST_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}

		if (res.status < 200 || res.status >= 300) {
			return {
				handle: "error",
				error: {
					code: "HTTP_STATUS_ERROR",
					message: `HTTP request returned non-2xx status ${res.status}`,
					blockId: ctx.blockId,
					details: { status: res.status },
				},
			};
		}

		return {
			handle: "out",
			output: {
				status: res.status,
				headers: res.headers,
				body: res.body,
			},
		};
	};
}
