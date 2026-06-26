import { describe, expect, test } from "bun:test";
import {
	branchToneForPort,
	categoryAccent,
	getNodeType,
	portColor,
	portTone,
} from "./index";
import { NodeCategory } from "./nodeCategory";

describe("category accent presentation", () => {
	test("every category resolves to a stable accent (class + hex)", () => {
		for (const category of Object.values(NodeCategory)) {
			const accent = categoryAccent(category);
			expect(typeof accent.color).toBe("string");
			expect(accent.color.startsWith("#")).toBe(true);
			// A tailwind-ish text class for headers/icons.
			expect(accent.textClass.length).toBeGreaterThan(0);
			// A soft tint class for the header strip background.
			expect(accent.tintClass.length).toBeGreaterThan(0);
		}
	});

	test("accents differ across the primary categories", () => {
		const ai = categoryAccent(NodeCategory.AI).color;
		const logic = categoryAccent(NodeCategory.Logic).color;
		const data = categoryAccent(NodeCategory.Data).color;
		expect(new Set([ai, logic, data]).size).toBe(3);
	});

	test("an unknown category id falls back to a neutral accent", () => {
		const accent = categoryAccent("totally-made-up" as NodeCategory);
		expect(accent.color.startsWith("#")).toBe(true);
		expect(accent.textClass.length).toBeGreaterThan(0);
	});
});

describe("branch port tone", () => {
	test("positive branch ports map to the success tone", () => {
		for (const name of ["true", "allowed", "approved"]) {
			expect(branchToneForPort(name)).toBe("success");
		}
	});

	test("negative branch ports map to the failure tone", () => {
		for (const name of ["false", "error", "blocked", "rejected"]) {
			expect(branchToneForPort(name)).toBe("failure");
		}
	});

	test("plain and default routing ports map to the neutral tone", () => {
		for (const name of ["out", "default", "case1", "in", "anything"]) {
			expect(branchToneForPort(name)).toBe("neutral");
		}
	});

	test("the branch tone is case-insensitive", () => {
		expect(branchToneForPort("TRUE")).toBe("success");
		expect(branchToneForPort("Error")).toBe("failure");
	});
});

describe("port colour + tone for a registered node", () => {
	test("a condition node's true/false out-ports resolve success/failure colours", () => {
		const def = getNodeType("condition");
		if (!def) throw new Error("condition not registered");
		const truePort = def.outputs.find((p) => p.name === "true");
		const falsePort = def.outputs.find((p) => p.name === "false");
		if (!(truePort && falsePort)) throw new Error("ports missing");

		expect(portTone(truePort)).toBe("success");
		expect(portTone(falsePort)).toBe("failure");
		expect(portColor(truePort)).not.toBe(portColor(falsePort));
		expect(portColor(truePort).startsWith("#")).toBe(true);
	});

	test("a neutral out-port resolves the neutral colour", () => {
		const def = getNodeType("loop");
		if (!def) throw new Error("loop not registered");
		const out = def.outputs.find((p) => p.name === "out");
		if (!out) throw new Error("out port missing");
		expect(portTone(out)).toBe("neutral");
		expect(portColor(out).startsWith("#")).toBe(true);
	});
});
