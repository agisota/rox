import { describe, expect, test } from "bun:test";
import {
	bareJid,
	deriveJid,
	normalizeJidLocalpart,
	parseJid,
	RESERVED_JID_LOCALPARTS,
	ROX_XMPP_DOMAIN,
} from "./jid";

describe("normalizeJidLocalpart", () => {
	test("lowercases + trims", () => {
		expect(normalizeJidLocalpart("  Alice  ")).toBe("alice");
		expect(normalizeJidLocalpart("MARK")).toBe("mark");
	});

	test("accepts dotted + hyphenated + underscored + digit handles", () => {
		expect(normalizeJidLocalpart("mark.lindgreen")).toBe("mark.lindgreen");
		expect(normalizeJidLocalpart("mark-l")).toBe("mark-l");
		expect(normalizeJidLocalpart("user_42")).toBe("user_42");
		expect(normalizeJidLocalpart("a")).toBe("a");
	});

	test("rejects an empty handle", () => {
		expect(() => normalizeJidLocalpart("")).toThrow();
		expect(() => normalizeJidLocalpart("   ")).toThrow();
	});

	test("rejects forbidden characters (RFC 7622)", () => {
		expect(() => normalizeJidLocalpart("a b")).toThrow();
		expect(() => normalizeJidLocalpart("a@b")).toThrow();
		expect(() => normalizeJidLocalpart("a/b")).toThrow();
		expect(() => normalizeJidLocalpart('a"b')).toThrow();
		expect(() => normalizeJidLocalpart("a:b")).toThrow();
		expect(() => normalizeJidLocalpart("a<b")).toThrow();
		expect(() => normalizeJidLocalpart("a&b")).toThrow();
	});

	test("rejects reserved infrastructure localparts", () => {
		for (const reserved of RESERVED_JID_LOCALPARTS) {
			expect(() => normalizeJidLocalpart(reserved)).toThrow();
			// Case-folded reservation: ADMIN is rejected too.
			expect(() => normalizeJidLocalpart(reserved.toUpperCase())).toThrow();
		}
	});
});

describe("deriveJid", () => {
	test("derives `<handle>@xmpp.rox.one` by default", () => {
		expect(deriveJid("alice")).toBe(`alice@${ROX_XMPP_DOMAIN}`);
	});

	test("respects a domain override (lowercased)", () => {
		expect(deriveJid("alice", "XMPP.Example.Org")).toBe(
			"alice@xmpp.example.org",
		);
	});

	test("propagates the localpart validation", () => {
		expect(() => deriveJid("bridge")).toThrow();
		expect(() => deriveJid("")).toThrow();
	});
});

describe("parseJid", () => {
	test("parses a bare JID", () => {
		expect(parseJid("alice@xmpp.rox.one")).toEqual({
			localpart: "alice",
			domain: "xmpp.rox.one",
			resource: null,
			bare: "alice@xmpp.rox.one",
		});
	});

	test("parses a full JID with a resource (resource case preserved)", () => {
		expect(parseJid("Alice@XMPP.Rox.One/Phone-7")).toEqual({
			localpart: "alice",
			domain: "xmpp.rox.one",
			resource: "Phone-7",
			bare: "alice@xmpp.rox.one",
		});
	});

	test("parses a domain-only JID", () => {
		expect(parseJid("xmpp.rox.one")).toEqual({
			localpart: null,
			domain: "xmpp.rox.one",
			resource: null,
			bare: "xmpp.rox.one",
		});
	});

	test("returns null for malformed JIDs", () => {
		expect(parseJid("")).toBeNull();
		expect(parseJid("   ")).toBeNull();
		expect(parseJid("@xmpp.rox.one")).toBeNull(); // empty localpart
		expect(parseJid("alice@")).toBeNull(); // empty domain
		expect(parseJid("a@b@c")).toBeNull(); // double @
	});

	test("a resource may contain a `/`", () => {
		const parsed = parseJid("alice@xmpp.rox.one/desktop/main");
		expect(parsed?.resource).toBe("desktop/main");
		expect(parsed?.bare).toBe("alice@xmpp.rox.one");
	});
});

describe("bareJid", () => {
	test("strips the resource", () => {
		expect(bareJid("alice@xmpp.rox.one/phone")).toBe("alice@xmpp.rox.one");
	});
	test("null for invalid input", () => {
		expect(bareJid("nope@")).toBeNull();
	});
});
