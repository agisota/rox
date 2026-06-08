import { afterEach, describe, expect, it } from "bun:test";
import { isLocalOnlyAuth } from "./local-only-auth";

const SERVER_KEY = "LOCAL_ONLY_AUTH";
const CLIENT_KEY = "NEXT_PUBLIC_LOCAL_ONLY_AUTH";

afterEach(() => {
	delete process.env[SERVER_KEY];
	delete process.env[CLIENT_KEY];
});

describe("isLocalOnlyAuth", () => {
	it("is off by default so the cloud auth path is unchanged", () => {
		expect(isLocalOnlyAuth()).toBe(false);
	});

	it("treats common truthy strings (case/space insensitive) as enabled", () => {
		for (const value of ["1", "true", "TRUE", "yes", "on", "  true  "]) {
			process.env[SERVER_KEY] = value;
			expect(isLocalOnlyAuth()).toBe(true);
			delete process.env[SERVER_KEY];
		}
	});

	it("treats other values (including empty/false) as disabled", () => {
		for (const value of ["", "0", "false", "no", "off", "nope"]) {
			process.env[SERVER_KEY] = value;
			expect(isLocalOnlyAuth()).toBe(false);
			delete process.env[SERVER_KEY];
		}
	});

	it("honors the NEXT_PUBLIC_ client mirror", () => {
		process.env[CLIENT_KEY] = "true";
		expect(isLocalOnlyAuth()).toBe(true);
	});
});
