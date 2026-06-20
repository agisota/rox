import { describe, expect, it } from "bun:test";
import superjson from "superjson";
import { isTrpcPath, trpcErrorResponse } from "./trpc-error";

describe("isTrpcPath", () => {
	it("returns true for the /trpc root", () => {
		expect(isTrpcPath("/trpc")).toBe(true);
	});

	it("returns true for nested tRPC procedure paths", () => {
		expect(isTrpcPath("/trpc/host.checkAccess")).toBe(true);
	});

	it("returns false for unrelated paths", () => {
		expect(isTrpcPath("/tunnel")).toBe(false);
		expect(isTrpcPath("/api/trpc")).toBe(false);
		expect(isTrpcPath("")).toBe(false);
		expect(isTrpcPath("/")).toBe(false);
	});
});

/**
 * Minimal stub of the Hono `Context.json` surface used by
 * `trpcErrorResponse`. Captures the body and status so we can assert on the
 * shaped error without spinning up a real Hono app or server.
 */
function makeContext() {
	const captured: { body?: unknown; status?: number } = {};
	const c = {
		json(body: unknown, status?: number) {
			captured.body = body;
			captured.status = status;
			return { body, status };
		},
	};
	return { c, captured };
}

describe("trpcErrorResponse", () => {
	it("maps UNAUTHORIZED to HTTP 401 and RPC -32001", () => {
		const { c, captured } = makeContext();
		// biome-ignore lint/suspicious/noExplicitAny: stub context
		trpcErrorResponse(c as any, "UNAUTHORIZED", "nope");

		expect(captured.status).toBe(401);
		// biome-ignore lint/suspicious/noExplicitAny: serialized superjson body
		const error = superjson.deserialize((captured.body as any).error) as {
			message: string;
			code: number;
			data: { code: string; httpStatus: number };
		};
		expect(error.message).toBe("nope");
		expect(error.code).toBe(-32001);
		expect(error.data.code).toBe("UNAUTHORIZED");
		expect(error.data.httpStatus).toBe(401);
	});

	it("maps FORBIDDEN to HTTP 403 and RPC -32003", () => {
		const { c, captured } = makeContext();
		// biome-ignore lint/suspicious/noExplicitAny: stub context
		trpcErrorResponse(c as any, "FORBIDDEN", "denied");

		expect(captured.status).toBe(403);
		// biome-ignore lint/suspicious/noExplicitAny: serialized superjson body
		const error = superjson.deserialize((captured.body as any).error) as {
			code: number;
			data: { code: string; httpStatus: number };
		};
		expect(error.code).toBe(-32003);
		expect(error.data).toEqual({ code: "FORBIDDEN", httpStatus: 403 });
	});

	it("maps SERVICE_UNAVAILABLE to HTTP 503 and RPC -32603", () => {
		const { c, captured } = makeContext();
		// biome-ignore lint/suspicious/noExplicitAny: stub context
		trpcErrorResponse(c as any, "SERVICE_UNAVAILABLE", "down");

		expect(captured.status).toBe(503);
		// biome-ignore lint/suspicious/noExplicitAny: serialized superjson body
		const error = superjson.deserialize((captured.body as any).error) as {
			code: number;
			data: { httpStatus: number };
		};
		expect(error.code).toBe(-32603);
		expect(error.data.httpStatus).toBe(503);
	});

	it("maps BAD_GATEWAY to HTTP 502 (shares RPC -32603 with SERVICE_UNAVAILABLE)", () => {
		const { c, captured } = makeContext();
		// biome-ignore lint/suspicious/noExplicitAny: stub context
		trpcErrorResponse(c as any, "BAD_GATEWAY", "upstream");

		expect(captured.status).toBe(502);
		// biome-ignore lint/suspicious/noExplicitAny: serialized superjson body
		const error = superjson.deserialize((captured.body as any).error) as {
			code: number;
			data: { code: string; httpStatus: number };
		};
		expect(error.code).toBe(-32603);
		expect(error.data).toEqual({ code: "BAD_GATEWAY", httpStatus: 502 });
	});
});
