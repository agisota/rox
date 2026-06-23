import { describe, expect, test } from "bun:test";
import { bytesToHex } from "./bytesToHex";

describe("bytesToHex", () => {
	test("encodes an empty buffer as an empty string", () => {
		expect(bytesToHex(new Uint8Array([]))).toBe("");
	});

	test("zero-pads single-digit bytes", () => {
		expect(bytesToHex(new Uint8Array([0, 1, 15]))).toBe("00010f");
	});

	test("encodes the full byte range correctly", () => {
		expect(bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe(
			"deadbeef",
		);
		expect(bytesToHex(new Uint8Array([255, 16, 0]))).toBe("ff1000");
	});

	test("produces lowercase hex matching the router's 64-char contract", () => {
		const bytes = new Uint8Array(32).fill(0xab);
		const hex = bytesToHex(bytes);
		expect(hex).toBe("ab".repeat(32));
		expect(hex).toHaveLength(64);
		expect(/^[a-f0-9]{64}$/.test(hex)).toBe(true);
	});
});
