import { describe, expect, it } from "bun:test";

import { parseAdminEmails, resolveIsAdmin } from "./access";

const DOMAIN = "@rox.one";

describe("parseAdminEmails", () => {
	it("returns an empty set for undefined/empty input", () => {
		expect(parseAdminEmails(undefined).size).toBe(0);
		expect(parseAdminEmails("").size).toBe(0);
		expect(parseAdminEmails("  ,  ").size).toBe(0);
	});

	it("normalizes and trims comma-separated emails", () => {
		const set = parseAdminEmails(" Foo@Bar.com , baz@qux.io ");
		expect(set.has("foo@bar.com")).toBe(true);
		expect(set.has("baz@qux.io")).toBe(true);
		expect(set.size).toBe(2);
	});
});

describe("resolveIsAdmin", () => {
	it("grants access to company-domain emails", () => {
		expect(
			resolveIsAdmin({ email: "jane@rox.one", companyEmailDomain: DOMAIN }),
		).toBe(true);
	});

	it("is case-insensitive on the domain", () => {
		expect(
			resolveIsAdmin({ email: "JANE@ROX.ONE", companyEmailDomain: DOMAIN }),
		).toBe(true);
	});

	it("denies non-company emails not on the allowlist", () => {
		expect(
			resolveIsAdmin({ email: "ext@gmail.com", companyEmailDomain: DOMAIN }),
		).toBe(false);
	});

	it("grants access to allowlisted emails", () => {
		expect(
			resolveIsAdmin({
				email: "ext@gmail.com",
				companyEmailDomain: DOMAIN,
				adminEmailsEnv: "ext@gmail.com,other@x.com",
			}),
		).toBe(true);
	});

	it("grants access to users with the admin role", () => {
		expect(
			resolveIsAdmin({
				email: "ext@gmail.com",
				role: "admin",
				companyEmailDomain: DOMAIN,
			}),
		).toBe(true);
	});

	it("denies the regular user role without other grants", () => {
		expect(
			resolveIsAdmin({
				email: "ext@gmail.com",
				role: "user",
				companyEmailDomain: DOMAIN,
			}),
		).toBe(false);
	});

	it("denies empty/missing emails", () => {
		expect(resolveIsAdmin({ email: "", companyEmailDomain: DOMAIN })).toBe(
			false,
		);
		expect(resolveIsAdmin({ email: null, companyEmailDomain: DOMAIN })).toBe(
			false,
		);
	});
});
