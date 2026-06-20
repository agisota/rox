import { describe, expect, it } from "bun:test";
import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
	it("renders zero and invalid sizes as 0 B", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(-5)).toBe("0 B");
		expect(formatBytes(Number.NaN)).toBe("0 B");
	});

	it("renders whole bytes without a fraction", () => {
		expect(formatBytes(512)).toBe("512 B");
	});

	it("scales into binary units", () => {
		expect(formatBytes(1024)).toBe("1.0 KiB");
		expect(formatBytes(1024 * 1024)).toBe("1.0 MiB");
		expect(formatBytes(1024 ** 3)).toBe("1.0 GiB");
	});

	it("matches the 10 GiB quota wording", () => {
		expect(formatBytes(10 * 1024 ** 3)).toBe("10.0 GiB");
	});

	it("honours a custom fraction-digit count", () => {
		expect(formatBytes(1536, 2)).toBe("1.50 KiB");
	});
});
