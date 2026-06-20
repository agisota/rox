import { describe, expect, it } from "bun:test";
import { CLIError } from "./errors";
import {
	boolean,
	number,
	OptionBuilderBase,
	positional,
	string,
} from "./option";

// The builders expose their config under the public `_` accessor. The public
// return types of the chained methods are `Omit<...>` for ergonomics, so we
// read through `OptionBuilderBase` to inspect the underlying config at runtime.
function inspect(b: unknown) {
	return (b as OptionBuilderBase)._.config;
}

describe("option factory functions", () => {
	it("string() builds a string config with a name", () => {
		const c = inspect(string("name"));
		expect(c.type).toBe("string");
		expect(c.name).toBe("name");
	});

	it("string() without a name leaves name undefined", () => {
		const c = inspect(string());
		expect(c.type).toBe("string");
		expect(c.name).toBeUndefined();
	});

	it("number() builds a number config", () => {
		expect(inspect(number("count")).type).toBe("number");
	});

	it("boolean() builds a boolean config", () => {
		expect(inspect(boolean("flag")).type).toBe("boolean");
	});

	it("positional() builds a positional config using the display name", () => {
		const c = inspect(positional("FILE"));
		expect(c.type).toBe("positional");
		expect(c.name).toBe("FILE");
	});
});

describe("OptionBuilderBase modifiers", () => {
	it("defaults to a string type with empty aliases", () => {
		const b = new OptionBuilderBase();
		expect(b._.config.type).toBe("string");
		expect(b._.config.aliases).toEqual([]);
	});

	it("alias() records aliases", () => {
		expect(inspect(string("file").alias("f", "F")).aliases).toEqual(["f", "F"]);
	});

	it("desc() sets the description", () => {
		expect(inspect(string("file").desc("a file")).description).toBe("a file");
	});

	it("hidden() marks the option hidden", () => {
		expect(inspect(string("secret").hidden()).isHidden).toBe(true);
	});

	it("required() marks the option required", () => {
		expect(inspect(string("name").required()).isRequired).toBe(true);
	});

	it("env() sets the env var name", () => {
		expect(inspect(string("token").env("ROX_TOKEN")).envVar).toBe("ROX_TOKEN");
	});

	it("conflicts() records conflicting option names", () => {
		expect(inspect(string("a").conflicts("b", "c")).conflictsWith).toEqual([
			"b",
			"c",
		]);
	});

	it("int() marks a number as integer", () => {
		expect(inspect(number("n").int()).isInt).toBe(true);
	});

	it("is immutable: modifiers return new instances", () => {
		const base = string("name");
		const withDesc = base.desc("x");
		expect(withDesc).not.toBe(base);
		expect(inspect(base).description).toBeUndefined();
	});
});

describe("OptionBuilderBase numeric bounds", () => {
	it("min() sets the minimum", () => {
		expect(inspect(number("n").min(2)).minVal).toBe(2);
	});

	it("max() sets the maximum", () => {
		expect(inspect(number("n").max(9)).maxVal).toBe(9);
	});

	it("min() throws when greater than an existing max", () => {
		expect(() => number("n").max(3).min(5)).toThrow(CLIError);
	});

	it("max() throws when lower than an existing min", () => {
		expect(() => number("n").min(5).max(3)).toThrow(CLIError);
	});
});

describe("OptionBuilderBase enum + default", () => {
	it("enum() records the allowed values", () => {
		expect(inspect(string("mode").enum("fast", "slow")).enumVals).toEqual([
			"fast",
			"slow",
		]);
	});

	it("default() sets the default value", () => {
		expect(inspect(string("name").default("x")).default).toBe("x");
	});

	it("default() throws when not part of an already-set enum", () => {
		expect(() =>
			string("mode")
				.enum("fast", "slow")
				.default("nope" as never),
		).toThrow(CLIError);
	});

	it("enum() throws when incompatible with an already-set default", () => {
		expect(() => string("mode").default("nope").enum("fast", "slow")).toThrow(
			CLIError,
		);
	});

	it("default() accepts a value within the enum", () => {
		expect(
			inspect(string("mode").enum("fast", "slow").default("fast")).default,
		).toBe("fast");
	});
});

describe("OptionBuilderBase variadic", () => {
	it("variadic() is allowed on string options", () => {
		expect(inspect(string("tag").variadic()).isVariadic).toBe(true);
	});

	it("variadic() is allowed on positional options", () => {
		expect(inspect(positional("FILES").variadic()).isVariadic).toBe(true);
	});

	it("variadic() throws on number options", () => {
		// Cast through unknown since the public type omits .variadic on number.
		const numeric = number("n") as unknown as { variadic: () => unknown };
		expect(() => numeric.variadic()).toThrow(CLIError);
	});
});
