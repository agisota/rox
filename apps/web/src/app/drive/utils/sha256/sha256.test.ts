import { describe, expect, it } from "bun:test";
import { sha256Hex, toHex } from "./sha256";

describe("toHex", () => {
	it("encodes bytes as zero-padded lowercase hex", () => {
		const buf = new Uint8Array([0x00, 0x0f, 0xff, 0xa0]).buffer;
		expect(toHex(buf)).toBe("000fffa0");
	});

	it("returns empty string for an empty buffer", () => {
		expect(toHex(new Uint8Array([]).buffer)).toBe("");
	});
});

describe("sha256Hex", () => {
	it("produces the canonical 64-char digest for known input", async () => {
		// SHA-256("abc") — the canonical NIST test vector.
		const blob = new Blob([new TextEncoder().encode("abc")]);
		const digest = await sha256Hex(blob);
		expect(digest).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
		expect(digest).toMatch(/^[a-f0-9]{64}$/);
	});
});
