import { describe, expect, it } from "bun:test";
import { formatFileSize } from "./formatFileSize";

describe("formatFileSize", () => {
	it("renders raw bytes below 1 KB", () => {
		expect(formatFileSize(0)).toBe("0 B");
		expect(formatFileSize(512)).toBe("512 B");
		expect(formatFileSize(1023)).toBe("1023 B");
	});

	it("promotes to KB / MB / GB / TB at 1024 boundaries", () => {
		expect(formatFileSize(1024)).toBe("1.0 KB");
		expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
		expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.0 GB");
		expect(formatFileSize(1024 ** 4)).toBe("1.0 TB");
	});

	it("uses one decimal below 10 and rounds above 10", () => {
		expect(formatFileSize(1536)).toBe("1.5 KB");
		expect(formatFileSize(10 * 1024 * 1024)).toBe("10 MB");
		expect(formatFileSize(Math.round(9.84 * 1024 * 1024))).toBe("9.8 MB");
	});

	it("caps the unit at TB for very large values", () => {
		expect(formatFileSize(5 * 1024 ** 4)).toBe("5.0 TB");
		expect(formatFileSize(2048 * 1024 ** 4)).toBe("2048 TB");
	});

	it("returns a dash for invalid input", () => {
		expect(formatFileSize(-1)).toBe("—");
		expect(formatFileSize(Number.NaN)).toBe("—");
		expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe("—");
	});
});
