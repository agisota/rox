import { describe, expect, test } from "bun:test";
import {
	ANY_PORT_TYPE,
	arePortTypesCompatible,
	effectivePortType,
	PORT_TYPES,
} from "./portTypes";

describe("portTypes", () => {
	test("includes the wildcard and the domain shapes", () => {
		expect(PORT_TYPES).toContain("any");
		expect(PORT_TYPES).toContain("message");
		expect(PORT_TYPES).toContain("chunks");
		expect(PORT_TYPES).toContain("vector");
		expect(ANY_PORT_TYPE).toBe("any");
	});

	test("effectivePortType collapses undefined/empty to `any`", () => {
		expect(effectivePortType(undefined)).toBe("any");
		expect(effectivePortType("")).toBe("any");
		expect(effectivePortType("string")).toBe("string");
	});

	test("`any` is compatible with everything (both directions)", () => {
		expect(arePortTypesCompatible("any", "string")).toBe(true);
		expect(arePortTypesCompatible("vector", "any")).toBe(true);
	});

	test("absent (legacy untyped) types are compatible with everything", () => {
		expect(arePortTypesCompatible(undefined, "string")).toBe(true);
		expect(arePortTypesCompatible("message", undefined)).toBe(true);
		expect(arePortTypesCompatible(undefined, undefined)).toBe(true);
	});

	test("two equal concrete types are compatible", () => {
		expect(arePortTypesCompatible("string", "string")).toBe(true);
		expect(arePortTypesCompatible("vector", "vector")).toBe(true);
	});

	test("two differing concrete types are incompatible", () => {
		expect(arePortTypesCompatible("vector", "string")).toBe(false);
		expect(arePortTypesCompatible("message", "chunks")).toBe(false);
	});
});
