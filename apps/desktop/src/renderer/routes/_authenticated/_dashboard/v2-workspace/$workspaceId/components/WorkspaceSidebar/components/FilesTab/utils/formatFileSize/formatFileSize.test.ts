import { describe, expect, it } from "bun:test";
import { formatFileSize } from "./formatFileSize";

describe("formatFileSize", () => {
	it("renders raw bytes without a fraction", () => {
		expect(formatFileSize(0)).toBe("0 B");
		expect(formatFileSize(1)).toBe("1 B");
		expect(formatFileSize(512)).toBe("512 B");
		expect(formatFileSize(1023)).toBe("1023 B");
	});

	it("steps into binary units with one decimal", () => {
		expect(formatFileSize(1024)).toBe("1.0 KB");
		expect(formatFileSize(1536)).toBe("1.5 KB");
		expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
		expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.0 GB");
		expect(formatFileSize(1024 ** 4)).toBe("1.0 TB");
	});

	it("caps at the largest known unit", () => {
		expect(formatFileSize(1024 ** 5)).toBe("1.0 PB");
		expect(formatFileSize(1024 ** 6)).toBe("1024.0 PB");
	});

	it("treats invalid or negative input as zero", () => {
		expect(formatFileSize(-5)).toBe("0 B");
		expect(formatFileSize(Number.NaN)).toBe("0 B");
		expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe("0 B");
	});
});
