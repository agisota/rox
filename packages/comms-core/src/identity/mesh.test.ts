import { describe, expect, test } from "bun:test";
import {
	isNostrPubkey,
	normalizeBase64Key,
	normalizeNostrPubkey,
} from "./mesh";

const HEX = "a".repeat(64);
const NPUB = "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

describe("normalizeNostrPubkey", () => {
	test("lowercases a hex pubkey", () => {
		expect(normalizeNostrPubkey("A".repeat(64))).toBe(HEX);
	});

	test("accepts and lowercases an npub", () => {
		expect(normalizeNostrPubkey(NPUB.toUpperCase())).toBe(NPUB);
	});

	test("trims surrounding whitespace", () => {
		expect(normalizeNostrPubkey(`  ${HEX}  `)).toBe(HEX);
	});

	test("throws on an empty key", () => {
		expect(() => normalizeNostrPubkey("   ")).toThrow();
	});

	test("throws on a malformed key", () => {
		expect(() => normalizeNostrPubkey("not-a-key")).toThrow();
		expect(() => normalizeNostrPubkey("a".repeat(63))).toThrow();
	});

	test("two encodings of an identical hex key fold equal", () => {
		expect(normalizeNostrPubkey("AbC".padEnd(64, "0"))).toBe(
			normalizeNostrPubkey("abc".padEnd(64, "0")),
		);
	});
});

describe("isNostrPubkey", () => {
	test("true for hex + npub, false otherwise", () => {
		expect(isNostrPubkey(HEX)).toBe(true);
		expect(isNostrPubkey(NPUB)).toBe(true);
		expect(isNostrPubkey("garbage")).toBe(false);
	});
});

describe("normalizeBase64Key", () => {
	test("returns null for absent keys", () => {
		expect(normalizeBase64Key(null)).toBeNull();
		expect(normalizeBase64Key(undefined)).toBeNull();
		expect(normalizeBase64Key("  ")).toBeNull();
	});

	test("returns the trimmed key for a valid base64 value", () => {
		const key = "dGhpcytpcythK2Jhc2U2NA==";
		expect(normalizeBase64Key(`  ${key}  `)).toBe(key);
	});

	test("throws on a malformed key", () => {
		expect(() => normalizeBase64Key("has spaces inside")).toThrow();
	});
});
