import { describe, expect, it } from "bun:test";
import {
	type ConsentState,
	canImportFromSource,
	isConsentActive,
} from "./browser-data.utils";

const accepted: ConsentState = {
	accepted: true,
	revokedAt: null,
	sources: ["chrome", "arc"],
};

describe("isConsentActive", () => {
	it("is false when there is no consent record", () => {
		expect(isConsentActive(null)).toBe(false);
	});

	it("is false when not accepted", () => {
		expect(isConsentActive({ ...accepted, accepted: false })).toBe(false);
	});

	it("is false once revoked", () => {
		expect(isConsentActive({ ...accepted, revokedAt: 123 })).toBe(false);
	});

	it("is true for an accepted, non-revoked record", () => {
		expect(isConsentActive(accepted)).toBe(true);
	});
});

describe("canImportFromSource", () => {
	it("blocks import without active consent", () => {
		expect(canImportFromSource(null, "chrome")).toBe(false);
		expect(canImportFromSource({ ...accepted, revokedAt: 1 }, "chrome")).toBe(
			false,
		);
	});

	it("blocks a source the user did not allow", () => {
		expect(canImportFromSource(accepted, "safari")).toBe(false);
	});

	it("allows an explicitly-permitted source under active consent", () => {
		expect(canImportFromSource(accepted, "chrome")).toBe(true);
		expect(canImportFromSource(accepted, "arc")).toBe(true);
	});
});
