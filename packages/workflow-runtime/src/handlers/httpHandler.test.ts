import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "../executor/types";
import {
	type HttpRequestInput,
	type HttpRequestPort,
	type HttpResponseResult,
	isForbiddenHost,
	makeHttpHandler,
} from "./httpHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
	resolveSecret: (key: string) => string | undefined = () => undefined,
): BlockHandlerContext {
	return {
		blockId: "h1",
		block: { type: "http_request", subBlocks },
		input,
		runInput: input,
		resolveSecret,
	};
}

/** Records every call so tests can assert the port was (or was not) invoked. */
function recordingPort(result: HttpResponseResult): {
	port: HttpRequestPort;
	calls: HttpRequestInput[];
} {
	const calls: HttpRequestInput[] = [];
	const port: HttpRequestPort = async (req) => {
		calls.push(req);
		return result;
	};
	return { port, calls };
}

const OK: HttpResponseResult = {
	status: 200,
	headers: { "content-type": "application/json" },
	body: '{"ok":true}',
};

describe("isForbiddenHost (SSRF guard)", () => {
	test("rejects the cloud metadata endpoint", () => {
		expect(isForbiddenHost("169.254.169.254")).toBe(true);
	});
	test("rejects loopback (127.0.0.0/8 + localhost + ::1)", () => {
		expect(isForbiddenHost("127.0.0.1")).toBe(true);
		expect(isForbiddenHost("127.1.2.3")).toBe(true);
		expect(isForbiddenHost("localhost")).toBe(true);
		expect(isForbiddenHost("api.localhost")).toBe(true);
		expect(isForbiddenHost("[::1]")).toBe(true);
		expect(isForbiddenHost("::1")).toBe(true);
	});
	test("rejects RFC1918 private ranges", () => {
		expect(isForbiddenHost("10.0.0.5")).toBe(true);
		expect(isForbiddenHost("172.16.4.4")).toBe(true);
		expect(isForbiddenHost("192.168.1.10")).toBe(true);
	});
	test("rejects link-local (v4 + v6)", () => {
		expect(isForbiddenHost("169.254.10.1")).toBe(true);
		expect(isForbiddenHost("[fe80::1]")).toBe(true);
	});
	test("rejects IPv4-mapped IPv6 loopback", () => {
		expect(isForbiddenHost("[::ffff:127.0.0.1]")).toBe(true);
	});
	test("allows public addresses and hostnames", () => {
		expect(isForbiddenHost("93.184.216.34")).toBe(false);
		expect(isForbiddenHost("example.com")).toBe(false);
		expect(isForbiddenHost("api.github.com")).toBe(false);
	});
});

describe("makeHttpHandler", () => {
	test("GET returns out handle with status + headers + body", async () => {
		const { port, calls } = recordingPort(OK);
		const handler = makeHttpHandler(port);
		const res = await handler(
			ctx({ method: "GET", url: "https://example.com/data" }),
		);
		expect(res.handle).toBe("out");
		expect(res.output?.status).toBe(200);
		expect(res.output?.body).toBe('{"ok":true}');
		expect(res.output?.headers).toEqual({ "content-type": "application/json" });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.body).toBeUndefined();
	});

	test("POST substitutes {{path}} into url + body and forwards them", async () => {
		const { port, calls } = recordingPort({ ...OK, status: 201 });
		const handler = makeHttpHandler(port);
		const res = await handler(
			ctx(
				{
					method: "post",
					url: "https://example.com/{{path}}",
					body: '{"msg":"{{greeting}}"}',
				},
				{ path: "submit", greeting: "hello" },
			),
		);
		expect(res.handle).toBe("out");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe("https://example.com/submit");
		expect(calls[0]?.body).toBe('{"msg":"hello"}');
	});

	test("non-2xx status routes to error handle", async () => {
		const { port } = recordingPort({ ...OK, status: 503, body: "down" });
		const handler = makeHttpHandler(port);
		const res = await handler(ctx({ url: "https://example.com" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("HTTP_STATUS_ERROR");
		expect(res.error?.details?.status).toBe(503);
	});

	test("transport failure routes to error handle", async () => {
		const handler = makeHttpHandler(async () => {
			throw new Error("ECONNRESET");
		});
		const res = await handler(ctx({ url: "https://example.com" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("HTTP_REQUEST_FAILED");
		expect(res.error?.message).toContain("ECONNRESET");
	});

	test("SSRF URL is rejected BEFORE the port is ever called", async () => {
		const { port, calls } = recordingPort(OK);
		const handler = makeHttpHandler(port);
		const res = await handler(
			ctx({ url: "http://169.254.169.254/latest/meta-data/" }),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("HTTP_SSRF_BLOCKED");
		expect(calls).toHaveLength(0);
	});

	test("SSRF guard runs after placeholder substitution (loopback via {{host}})", async () => {
		const { port, calls } = recordingPort(OK);
		const handler = makeHttpHandler(port);
		const res = await handler(
			ctx({ url: "http://{{host}}/x" }, { host: "127.0.0.1" }),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("HTTP_SSRF_BLOCKED");
		expect(calls).toHaveLength(0);
	});

	test("missing url routes to error handle", async () => {
		const { port } = recordingPort(OK);
		const res = await makeHttpHandler(port)(ctx({ method: "GET" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("HTTP_URL_MISSING");
	});

	test("non-http scheme is rejected", async () => {
		const { port, calls } = recordingPort(OK);
		const res = await makeHttpHandler(port)(ctx({ url: "file:///etc/passwd" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("HTTP_SCHEME_FORBIDDEN");
		expect(calls).toHaveLength(0);
	});

	test("secret auth is resolved via resolveSecret and does not leak into output", async () => {
		const secret = "super-secret-token-value";
		const { port, calls } = recordingPort(OK);
		const handler = makeHttpHandler(port);
		const res = await handler(
			ctx({ url: "https://example.com", authRef: "MY_TOKEN" }, {}, (key) =>
				key === "MY_TOKEN" ? secret : undefined,
			),
		);
		expect(res.handle).toBe("out");
		// Secret reached the port as a Bearer header...
		expect(calls[0]?.headers.Authorization).toBe(`Bearer ${secret}`);
		// ...but never appears in the handler's returned output payload.
		expect(JSON.stringify(res.output)).not.toContain(secret);
	});
});
