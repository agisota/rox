import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
	isLiveblocksClientEnabled,
	isLiveblocksServerEnabled,
	requireLiveblocksSecretKey,
	resolveLiveblocksEnv,
} from "./env";

const KEYS = ["LIVEBLOCKS_SECRET_KEY", "NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY"];

let original: Record<string, string | undefined>;

beforeEach(() => {
	original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
	for (const k of KEYS) {
		delete process.env[k];
	}
});

afterEach(() => {
	for (const k of KEYS) {
		const v = original[k];
		if (v === undefined) {
			delete process.env[k];
		} else {
			process.env[k] = v;
		}
	}
});

describe("@rox/collab env", () => {
	test("resolves to undefined when nothing is set", () => {
		const env = resolveLiveblocksEnv();
		expect(env.secretKey).toBeUndefined();
		expect(env.publicKey).toBeUndefined();
		expect(isLiveblocksServerEnabled(env)).toBe(false);
		expect(isLiveblocksClientEnabled(env)).toBe(false);
	});

	test("treats empty strings as unset", () => {
		process.env.LIVEBLOCKS_SECRET_KEY = "";
		expect(resolveLiveblocksEnv().secretKey).toBeUndefined();
	});

	test("reads both keys when present", () => {
		process.env.LIVEBLOCKS_SECRET_KEY = "sk_test_secret";
		process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY = "pk_test_public";
		const env = resolveLiveblocksEnv();
		expect(env.secretKey).toBe("sk_test_secret");
		expect(env.publicKey).toBe("pk_test_public");
		expect(isLiveblocksServerEnabled(env)).toBe(true);
		expect(isLiveblocksClientEnabled(env)).toBe(true);
	});

	test("requireLiveblocksSecretKey throws when missing, returns when present", () => {
		expect(() => requireLiveblocksSecretKey()).toThrow(/LIVEBLOCKS_SECRET_KEY/);
		process.env.LIVEBLOCKS_SECRET_KEY = "sk_present";
		expect(requireLiveblocksSecretKey()).toBe("sk_present");
	});
});
