/// <reference types="bun-types" />
import { describe, expect, it } from "bun:test";

import {
	APIConnectionError,
	APIConnectionTimeoutError,
	APIError,
	APIUserAbortError,
	AuthenticationError,
	BadRequestError,
	ConflictError,
	InternalServerError,
	NotFoundError,
	PermissionDeniedError,
	RateLimitError,
	RoxError,
	UnprocessableEntityError,
} from "./error";

/**
 * CHARACTERIZATION TESTS — capture the CURRENT behavior of the SDK error model
 * (the `core/error.ts` Stainless-generated hierarchy) before any refactor.
 * These assert what the code does today, not what it ideally should do.
 */

describe("RoxError", () => {
	it("is a subclass of the built-in Error", () => {
		const err = new RoxError("boom");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(RoxError);
		expect(err.message).toBe("boom");
	});
});

describe("APIError construction", () => {
	it("exposes status, headers, and error body as readonly fields", () => {
		const headers = new Headers({ "x-test": "1" });
		const body = { message: "bad things" };
		const err = new APIError(400, body, undefined, headers);

		expect(err).toBeInstanceOf(RoxError);
		expect(err).toBeInstanceOf(APIError);
		expect(err.status).toBe(400);
		expect(err.headers).toBe(headers);
		expect(err.error).toBe(body);
	});

	describe("message formatting (makeMessage)", () => {
		it("prefixes status and uses a string error.message", () => {
			const err = new APIError(
				400,
				{ message: "Invalid request" },
				undefined,
				new Headers(),
			);
			expect(err.message).toBe("400 Invalid request");
		});

		it("JSON-stringifies a non-string error.message", () => {
			const err = new APIError(
				422,
				{ message: { field: "title" } },
				undefined,
				new Headers(),
			);
			expect(err.message).toBe('422 {"field":"title"}');
		});

		it("JSON-stringifies the whole error body when there is no message field", () => {
			const err = new APIError(
				500,
				{ code: "ERR" },
				undefined,
				new Headers(),
			);
			expect(err.message).toBe('500 {"code":"ERR"}');
		});

		it("reports a status code with no body when error and message are absent", () => {
			const err = new APIError(404, undefined, undefined, new Headers());
			expect(err.message).toBe("404 status code (no body)");
		});

		it("falls back to the provided message when there is no status", () => {
			const err = new APIError(undefined, undefined, "fallback", undefined);
			expect(err.message).toBe("fallback");
		});

		it("reports no status code or body when everything is absent", () => {
			const err = new APIError(undefined, undefined, undefined, undefined);
			expect(err.message).toBe("(no status code or body)");
		});
	});
});

describe("APIError.generate status -> subclass mapping", () => {
	const headers = new Headers();

	it("maps known statuses to their dedicated subclasses", () => {
		const cases: Array<[number, new (...args: never[]) => APIError]> = [
			[400, BadRequestError],
			[401, AuthenticationError],
			[403, PermissionDeniedError],
			[404, NotFoundError],
			[409, ConflictError],
			[422, UnprocessableEntityError],
			[429, RateLimitError],
			[500, InternalServerError],
			[503, InternalServerError],
		];

		for (const [status, ctor] of cases) {
			const err = APIError.generate(status, { message: "x" }, undefined, headers);
			expect(err).toBeInstanceOf(ctor);
			expect(err.status).toBe(status);
		}
	});

	it("returns a plain APIError for an unmapped 4xx status", () => {
		const err = APIError.generate(418, {}, undefined, headers);
		expect(err).toBeInstanceOf(APIError);
		// 418 is not one of the dedicated subclasses
		expect(err).not.toBeInstanceOf(BadRequestError);
		expect(err).not.toBeInstanceOf(NotFoundError);
		expect(err.status).toBe(418);
	});

	it("returns an APIConnectionError when status is missing (no response)", () => {
		const err = APIError.generate(undefined, undefined, "boom", undefined);
		expect(err).toBeInstanceOf(APIConnectionError);
	});

	it("returns an APIConnectionError when headers are missing", () => {
		const err = APIError.generate(500, {}, "boom", undefined);
		expect(err).toBeInstanceOf(APIConnectionError);
	});
});

describe("connection / abort errors", () => {
	it("APIUserAbortError defaults to undefined status and an abort message", () => {
		const err = new APIUserAbortError();
		expect(err).toBeInstanceOf(APIError);
		expect(err.status).toBeUndefined();
		expect(err.message).toBe("Request was aborted.");
	});

	it("APIConnectionError defaults to a connection-error message and records cause", () => {
		const cause = new Error("socket hang up");
		const err = new APIConnectionError({ cause });
		expect(err.status).toBeUndefined();
		expect(err.message).toBe("Connection error.");
		// cause is attached when provided
		expect((err as { cause?: unknown }).cause).toBe(cause);
	});

	it("APIConnectionTimeoutError is a connection error with a timeout message", () => {
		const err = new APIConnectionTimeoutError();
		expect(err).toBeInstanceOf(APIConnectionError);
		expect(err.message).toBe("Request timed out.");
	});
});
