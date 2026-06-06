import { describe, expect, it } from "bun:test";
import { CLIError } from "./errors";
import { boolean, number, positional, string } from "./option";

describe("option builders", () => {
	it("set their option type and name", () => {
		expect(string("file")._.config.type).toBe("string");
		expect(string("file")._.config.name).toBe("file");
		expect(number("n")._.config.type).toBe("number");
		expect(boolean("b")._.config.type).toBe("boolean");
		expect(positional("p")._.config.type).toBe("positional");
	});

	it("chain modifiers into the config", () => {
		const cfg = string("file").alias("f", "F").desc("a file").default("x")
			._.config;
		expect(cfg.aliases).toEqual(["f", "F"]);
		expect(cfg.description).toBe("a file");
		expect(cfg.default).toBe("x");
	});

	it("are immutable — chaining does not mutate the source builder", () => {
		const base = string("file");
		base.alias("f").desc("changed");
		expect(base._.config.aliases).toEqual([]);
		expect(base._.config.description).toBeUndefined();
	});

	it("record enum values", () => {
		expect(string("mode").enum("a", "b")._.config.enumVals).toEqual(["a", "b"]);
	});

	it("record min/max bounds", () => {
		const cfg = number("n").min(1).max(10)._.config;
		expect(cfg.minVal).toBe(1);
		expect(cfg.maxVal).toBe(10);
	});

	it("reject an inverted min/max range", () => {
		expect(() => number("n").min(5).max(1)).toThrow(CLIError);
		expect(() => number("n").max(1).min(5)).toThrow(CLIError);
	});

	it("allow variadic on string options", () => {
		expect(string("files").variadic()._.config.isVariadic).toBe(true);
	});
});
