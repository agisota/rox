import { describe, expect, it } from "bun:test";
import { REDACTED, redactPii, redactValue, sanitizeEvent } from "./sanitize";

describe("redactPii — sensitive keys", () => {
	it("redacts values of email-like keys regardless of content", () => {
		const out = redactPii({
			email: "ada@example.com",
			userEmail: "grace@navy.mil",
			email_address: "anything-at-all",
			EMAIL: "UPPER@case.io",
		});
		expect(out.email).toBe(REDACTED);
		expect(out.userEmail).toBe(REDACTED);
		expect(out.email_address).toBe(REDACTED);
		expect(out.EMAIL).toBe(REDACTED);
	});

	it("redacts credentials, tokens, and personal-name keys", () => {
		const out = redactPii({
			password: "hunter2",
			client_secret: "shh",
			access_token: "abc",
			api_key: "k",
			first_name: "Ada",
			last_name: "Lovelace",
			phone: "+1 555 0100",
			home_address: "10 Downing St",
		});
		for (const key of Object.keys(out)) {
			expect(out[key]).toBe(REDACTED);
		}
	});

	it("keeps safe analytics dimensions that merely look name-ish", () => {
		const out = redactPii({
			name: "agent_run_completed",
			event_name: "prompt_submitted",
			app_name: "desktop",
			model_name: "claude-opus-4-8",
			workflow_name: "ci",
			ip_address: "203.0.113.7",
		});
		expect(out.name).toBe("agent_run_completed");
		expect(out.event_name).toBe("prompt_submitted");
		expect(out.app_name).toBe("desktop");
		expect(out.model_name).toBe("claude-opus-4-8");
		expect(out.workflow_name).toBe("ci");
		expect(out.ip_address).toBe("203.0.113.7");
	});
});

describe("redactPii — sensitive value shapes", () => {
	it("redacts an email hiding in an innocuously-named field", () => {
		const out = redactPii({ note: "ping ada@example.com about it" });
		expect(out.note).toBe(REDACTED);
	});

	it("redacts JWTs, bearer tokens, and secret-prefixed keys by value", () => {
		const out = redactPii({
			a: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N",
			b: "Bearer abcdef1234567890",
			c: "sk-live_0123456789abcdef",
			d: "ghp_0123456789abcdefghij",
		});
		expect(out.a).toBe(REDACTED);
		expect(out.b).toBe(REDACTED);
		expect(out.c).toBe(REDACTED);
		expect(out.d).toBe(REDACTED);
	});

	it("redacts card-number-shaped values", () => {
		expect(redactPii({ x: "4111 1111 1111 1111" }).x).toBe(REDACTED);
		expect(redactPii({ x: "4111-1111-1111-1111" }).x).toBe(REDACTED);
	});

	it("scans long digit-heavy strings in linear time (no ReDoS)", () => {
		// A 30-digit run embedded between word characters (no surrounding word
		// boundary) is the pathological input for a backtracking card regex. The
		// linear matcher must complete near-instantly and, since there is no
		// boundary-delimited card run, leave the value untouched.
		const payload = { id: `run_${"1".repeat(30)}xyz` };
		const start = performance.now();
		const out = redactPii(payload);
		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(10);
		expect(out.id).toBe(payload.id);
	});

	it("leaves ordinary strings, numbers, booleans, and null untouched", () => {
		const out = redactPii({
			run_id: "run_123",
			duration_ms: 4200,
			ok: true,
			missing: null,
			status: "completed",
		});
		expect(out).toEqual({
			run_id: "run_123",
			duration_ms: 4200,
			ok: true,
			missing: null,
			status: "completed",
		});
	});
});

describe("redactPii — structure", () => {
	it("returns an empty object for undefined input", () => {
		expect(redactPii(undefined)).toEqual({});
	});

	it("does not mutate the input object", () => {
		const input = { email: "ada@example.com", run_id: "r1" };
		const out = redactPii(input);
		expect(input.email).toBe("ada@example.com");
		expect(out.email).toBe(REDACTED);
		expect(out).not.toBe(input);
	});

	it("recurses into nested objects and arrays", () => {
		const out = redactPii({
			user: { email: "ada@example.com", id: "u1" },
			tags: ["safe", "reach me at grace@navy.mil"],
		});
		expect((out.user as Record<string, unknown>).email).toBe(REDACTED);
		expect((out.user as Record<string, unknown>).id).toBe("u1");
		expect((out.tags as unknown[])[0]).toBe("safe");
		expect((out.tags as unknown[])[1]).toBe(REDACTED);
	});

	it("caps recursion depth, redacting beyond the limit", () => {
		const deep = { a: { b: { c: { d: { e: "too deep" } } } } };
		const out = redactPii(deep, { maxDepth: 2 });
		const a = out.a as Record<string, unknown>;
		const b = a.b as Record<string, unknown>;
		// At maxDepth 2 the third level of nesting is collapsed to the marker.
		expect(b.c).toBe(REDACTED);
	});

	it("preserves safe primitives that sit beyond the depth cap", () => {
		// The cap bounds recursion into nested *structures* — it must not corrupt a
		// plain number/string that happens to live deep in the tree.
		const out = redactPii({ a: { b: { c: 42 } } }, { maxDepth: 2 });
		const a = out.a as Record<string, unknown>;
		const b = a.b as Record<string, unknown>;
		expect(b.c).toBe(42);
	});
});

describe("redactValue", () => {
	it("redacts a single sensitive string", () => {
		expect(redactValue("ada@example.com")).toBe(REDACTED);
	});

	it("passes through safe values", () => {
		expect(redactValue("hello")).toBe("hello");
		expect(redactValue(42)).toBe(42);
		expect(redactValue(true)).toBe(true);
		expect(redactValue(null)).toBe(null);
	});
});

describe("sanitizeEvent", () => {
	it("scrubs properties while preserving the event name", () => {
		const event = sanitizeEvent({
			name: "auth_completed",
			properties: { email: "ada@example.com", plan: "pro" },
		});
		expect(event.name).toBe("auth_completed");
		expect(event.properties.email).toBe(REDACTED);
		expect(event.properties.plan).toBe("pro");
	});

	it("defaults missing properties to an empty object", () => {
		const input: { name: string; properties?: Record<string, unknown> } = {
			name: "desktop_opened",
		};
		const event = sanitizeEvent(input);
		expect(event.properties).toEqual({});
	});
});
