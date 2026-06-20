import { describe, expect, it } from "bun:test";
import {
	deriveAddresses,
	normalizeHandle,
	ROX_ADDRESS_DOMAIN,
} from "./deriveAddresses";

describe("normalizeHandle", () => {
	it("lowercases and trims", () => {
		expect(normalizeHandle("  Mark ")).toBe("mark");
	});

	it("throws on empty handle", () => {
		expect(() => normalizeHandle("   ")).toThrow();
	});
});

describe("deriveAddresses", () => {
	it("derives email and JID from the handle on rox.one", () => {
		const addrs = deriveAddresses("mark");
		expect(addrs).toEqual({
			handle: "mark",
			email: "mark@rox.one",
			xmpp: "mark@rox.one",
			mesh: null,
		});
	});

	it("is case-insensitive (same inbox for Mark and mark)", () => {
		expect(deriveAddresses("Mark").email).toBe(deriveAddresses("mark").email);
	});

	it("honors a custom domain", () => {
		const addrs = deriveAddresses("mark", "rox.dev");
		expect(addrs.email).toBe("mark@rox.dev");
		expect(addrs.xmpp).toBe("mark@rox.dev");
	});

	it("defaults to the rox.one domain constant", () => {
		expect(
			deriveAddresses("mark").email.endsWith(`@${ROX_ADDRESS_DOMAIN}`),
		).toBe(true);
	});

	it("leaves mesh unset (provisioned by the mesh adapter)", () => {
		expect(deriveAddresses("mark").mesh).toBeNull();
	});
});
