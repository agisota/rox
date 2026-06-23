import { describe, expect, test } from "bun:test";
import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
	test("renders raw bytes without decimals", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(1023)).toBe("1023 B");
	});

	test("scales into binary units with one decimal", () => {
		expect(formatBytes(1024)).toBe("1.0 KB");
		expect(formatBytes(1536)).toBe("1.5 KB");
		expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
		expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
	});

	test("guards against invalid input", () => {
		expect(formatBytes(-5)).toBe("0 B");
		expect(formatBytes(Number.NaN)).toBe("0 B");
	});
});
