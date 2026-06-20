import { describe, expect, it } from "bun:test";
import type { ProcessedBuilderConfig } from "./option";
import { camelToKebab, isAgentMode, parseArgv } from "./parser";

function cfg(
	overrides: Partial<ProcessedBuilderConfig> & {
		name: string;
		type: ProcessedBuilderConfig["type"];
	},
): ProcessedBuilderConfig {
	return { aliases: [], ...overrides };
}

// parseArgv slices off the first two argv entries (node, script), so prefix them.
function argv(...rest: string[]): string[] {
	return ["node", "cli", ...rest];
}

describe("camelToKebab", () => {
	it("converts camelCase to kebab-case", () => {
		expect(camelToKebab("dryRun")).toBe("dry-run");
	});

	it("handles consecutive capitals", () => {
		expect(camelToKebab("parseURL")).toBe("parse-u-r-l");
	});

	it("leaves an all-lowercase string unchanged", () => {
		expect(camelToKebab("build")).toBe("build");
	});

	it("lowercases a leading capital with a hyphen prefix", () => {
		expect(camelToKebab("Foo")).toBe("-foo");
	});
});

describe("isAgentMode", () => {
	it("returns true when an agent env var is set to a non-empty value", () => {
		const prev = process.env.ROX_AGENT;
		process.env.ROX_AGENT = "1";
		try {
			expect(isAgentMode()).toBe(true);
		} finally {
			if (prev === undefined) delete process.env.ROX_AGENT;
			else process.env.ROX_AGENT = prev;
		}
	});

	it("treats an empty string as not set", () => {
		// Save and clear all known agent vars to assert the empty-string branch.
		const vars = [
			"CLAUDE_CODE",
			"CLAUDECODE",
			"CLAUDE_CODE_ENTRYPOINT",
			"CODEX_CLI",
			"GEMINI_CLI",
			"ROX_AGENT",
			"CI",
		];
		const saved = new Map<string, string | undefined>();
		for (const v of vars) {
			saved.set(v, process.env[v]);
			delete process.env[v];
		}
		process.env.ROX_AGENT = "";
		try {
			expect(isAgentMode()).toBe(false);
		} finally {
			for (const v of vars) {
				const val = saved.get(v);
				if (val === undefined) delete process.env[v];
				else process.env[v] = val;
			}
		}
	});
});

describe("parseArgv", () => {
	it("returns empty result for no args", () => {
		const result = parseArgv(argv(), {});
		expect(result).toEqual({
			commandPath: [],
			options: {},
			positionals: [],
		});
	});

	it("collects bare tokens as positionals", () => {
		const result = parseArgv(argv("foo", "bar"), {});
		expect(result.positionals).toEqual(["foo", "bar"]);
	});

	it("sets _help for --help and -h when no command owns it", () => {
		expect(parseArgv(argv("--help"), {}).options._help).toBe(true);
		expect(parseArgv(argv("-h"), {}).options._help).toBe(true);
	});

	it("sets _version for --version and -v when no command owns it", () => {
		expect(parseArgv(argv("--version"), {}).options._version).toBe(true);
		expect(parseArgv(argv("-v"), {}).options._version).toBe(true);
	});

	it("treats everything after -- as positional", () => {
		const result = parseArgv(argv("--", "--help", "-x", "raw"), {});
		expect(result.options._help).toBeUndefined();
		expect(result.positionals).toEqual(["--help", "-x", "raw"]);
	});

	it("parses --flag=value form", () => {
		const result = parseArgv(argv("--name=alice"), {
			name: cfg({ name: "name", type: "string" }),
		});
		expect(result.options.name).toBe("alice");
	});

	it("parses --flag value form", () => {
		const result = parseArgv(argv("--name", "bob"), {
			name: cfg({ name: "name", type: "string" }),
		});
		expect(result.options.name).toBe("bob");
	});

	it("resolves single-char names to a short flag", () => {
		const result = parseArgv(argv("-n", "x"), {
			n: cfg({ name: "n", type: "string" }),
		});
		expect(result.options.n).toBe("x");
	});

	it("resolves aliases", () => {
		const result = parseArgv(argv("-f", "y"), {
			file: cfg({ name: "file", type: "string", aliases: ["f"] }),
		});
		expect(result.options.file).toBe("y");
	});

	it("treats a bare boolean flag as true", () => {
		const result = parseArgv(argv("--verbose"), {
			verbose: cfg({ name: "verbose", type: "boolean" }),
		});
		expect(result.options.verbose).toBe(true);
	});

	it("consumes an explicit boolean value", () => {
		const t = parseArgv(argv("--verbose", "true"), {
			verbose: cfg({ name: "verbose", type: "boolean" }),
		});
		expect(t.options.verbose).toBe(true);
		const f = parseArgv(argv("--verbose", "0"), {
			verbose: cfg({ name: "verbose", type: "boolean" }),
		});
		expect(f.options.verbose).toBe(false);
	});

	it("supports --no-flag negation for booleans", () => {
		const result = parseArgv(argv("--no-color"), {
			color: cfg({ name: "color", type: "boolean" }),
		});
		expect(result.options.color).toBe(false);
	});

	it("coerces number options and validates the value", () => {
		const result = parseArgv(argv("--count", "7"), {
			count: cfg({ name: "count", type: "number" }),
		});
		expect(result.options.count).toBe(7);
	});

	it("throws on a non-numeric value for a number option", () => {
		expect(() =>
			parseArgv(argv("--count", "abc"), {
				count: cfg({ name: "count", type: "number" }),
			}),
		).toThrow(/expected a number/);
	});

	it("enforces integer constraint", () => {
		expect(() =>
			parseArgv(argv("--count", "1.5"), {
				count: cfg({ name: "count", type: "number", isInt: true }),
			}),
		).toThrow(/expected an integer/);
	});

	it("enforces min and max bounds", () => {
		expect(() =>
			parseArgv(argv("--count", "0"), {
				count: cfg({ name: "count", type: "number", minVal: 1 }),
			}),
		).toThrow(/below minimum/);
		expect(() =>
			parseArgv(argv("--count", "10"), {
				count: cfg({ name: "count", type: "number", maxVal: 5 }),
			}),
		).toThrow(/above maximum/);
	});

	it("accumulates variadic string values", () => {
		const result = parseArgv(argv("--tag", "a", "--tag", "b"), {
			tag: cfg({ name: "tag", type: "string", isVariadic: true }),
		});
		expect(result.options.tag).toEqual(["a", "b"]);
	});

	it("accumulates variadic values via the = form", () => {
		const result = parseArgv(argv("--tag=a", "--tag=b"), {
			tag: cfg({ name: "tag", type: "string", isVariadic: true }),
		});
		expect(result.options.tag).toEqual(["a", "b"]);
	});

	it("validates enum values", () => {
		expect(() =>
			parseArgv(argv("--mode", "nope"), {
				mode: cfg({ name: "mode", type: "string", enumVals: ["fast", "slow"] }),
			}),
		).toThrow(/invalid value/);
		const ok = parseArgv(argv("--mode", "fast"), {
			mode: cfg({ name: "mode", type: "string", enumVals: ["fast", "slow"] }),
		});
		expect(ok.options.mode).toBe("fast");
	});

	it("throws on an unknown option", () => {
		expect(() => parseArgv(argv("--bogus", "x"), {})).toThrow(/Unknown option/);
	});

	it("throws on an unknown option in = form", () => {
		expect(() => parseArgv(argv("--bogus=x"), {})).toThrow(/Unknown option/);
	});

	it("throws when a value option has no value", () => {
		expect(() =>
			parseArgv(argv("--name"), {
				name: cfg({ name: "name", type: "string" }),
			}),
		).toThrow(/requires a value/);
	});

	it("applies defaults for unset options", () => {
		const result = parseArgv(argv(), {
			name: cfg({ name: "name", type: "string", default: "def" }),
		});
		expect(result.options.name).toBe("def");
	});

	it("resolves an env var when the option is unset", () => {
		const prev = process.env.ROX_TEST_PARSER_VAL;
		process.env.ROX_TEST_PARSER_VAL = "from-env";
		try {
			const result = parseArgv(argv(), {
				name: cfg({
					name: "name",
					type: "string",
					envVar: "ROX_TEST_PARSER_VAL",
				}),
			});
			expect(result.options.name).toBe("from-env");
		} finally {
			if (prev === undefined) delete process.env.ROX_TEST_PARSER_VAL;
			else process.env.ROX_TEST_PARSER_VAL = prev;
		}
	});

	it("prefers an explicit value over the env var", () => {
		const prev = process.env.ROX_TEST_PARSER_VAL;
		process.env.ROX_TEST_PARSER_VAL = "from-env";
		try {
			const result = parseArgv(argv("--name", "explicit"), {
				name: cfg({
					name: "name",
					type: "string",
					envVar: "ROX_TEST_PARSER_VAL",
				}),
			});
			expect(result.options.name).toBe("explicit");
		} finally {
			if (prev === undefined) delete process.env.ROX_TEST_PARSER_VAL;
			else process.env.ROX_TEST_PARSER_VAL = prev;
		}
	});

	it("throws when a required option is missing", () => {
		expect(() =>
			parseArgv(argv(), {
				name: cfg({ name: "name", type: "string", isRequired: true }),
			}),
		).toThrow(/Missing required option/);
	});

	it("treats an empty variadic as missing for required", () => {
		expect(() =>
			parseArgv(argv(), {
				tag: cfg({
					name: "tag",
					type: "string",
					isVariadic: true,
					isRequired: true,
				}),
			}),
		).toThrow(/Missing required option/);
	});

	it("throws when conflicting options are both set", () => {
		expect(() =>
			parseArgv(argv("--foo", "1", "--bar", "2"), {
				foo: cfg({ name: "foo", type: "string", conflictsWith: ["bar"] }),
				bar: cfg({ name: "bar", type: "string" }),
			}),
		).toThrow(/cannot be used together/);
	});

	it("merges global configs underneath command configs", () => {
		const result = parseArgv(
			argv("--json"),
			{},
			{ json: cfg({ name: "json", type: "boolean" }) },
		);
		expect(result.options.json).toBe(true);
	});

	it("defers --version to a command-owned option", () => {
		const result = parseArgv(argv("--version", "1.2.3"), {
			version: cfg({ name: "version", type: "string" }),
		});
		expect(result.options.version).toBe("1.2.3");
		expect(result.options._version).toBeUndefined();
	});
});
