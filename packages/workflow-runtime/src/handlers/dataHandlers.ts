import { Parser } from "expr-eval";
import type { BlockHandler, BlockHandlerContext } from "../executor/types";

/**
 * Pure data-node handlers (#546): `transform`, `parser`, `variable_set`. Each is
 * a db-free transform over the block's merged upstream `input`, so they register
 * directly in the pipeline handler map (no impure port). Expressions are
 * evaluated with `expr-eval` (no `eval`/`Function`), the same safe evaluator the
 * `condition` node uses.
 *
 * Keep this module's imports type-only against the runtime barrel (mirrors the
 * other handler modules) so the `./handlers` subpath stays import-cycle-safe.
 */

/** Shared, stateless expression parser. `expr-eval` ASTs carry no scope state. */
const EXPR = new Parser();

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/** Walk a dotted path (`a.b.c`) against a record; undefined on any miss. */
function getPath(source: Record<string, unknown>, path: string): unknown {
	let cur: unknown = source;
	for (const key of path.split(".")) {
		if (cur == null || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[key];
	}
	return cur;
}

const PLACEHOLDER = /\{\{\s*([\w.$-]+)\s*\}\}/g;

/**
 * Expand `{{path}}` placeholders in a template against the block input. Mirrors
 * the model node's resolver: missing paths collapse to an empty string, non-string
 * values are JSON-encoded. Single-scope (immediate upstream output); the richer
 * cross-node resolver lands with the data-passing issue (#550).
 */
export function renderTemplate(
	template: string,
	input: Record<string, unknown>,
): string {
	return template.replace(PLACEHOLDER, (_match, path: string) => {
		const value = getPath(input, path);
		if (value == null) return "";
		return typeof value === "string" ? value : JSON.stringify(value);
	});
}

/**
 * Evaluate a single `expr-eval` expression against the block input as scope.
 * Throws on a malformed expression (caught by the caller and routed to `error`).
 */
function evalExpression(expr: string, input: Record<string, unknown>): unknown {
	// `expr-eval`'s `evaluate` scope is typed narrowly (`Value`); our input is an
	// arbitrary jsonb record, so cast at this single boundary.
	return EXPR.evaluate(expr, input as Record<string, never>);
}

/**
 * `transform` handler. Two modes (matching the registry config schema):
 *  - `template`: render `subBlocks.template` (`{{path}}` placeholders) → `{ text }`.
 *  - `mapping` (default): for each `outField → expression` entry in
 *    `subBlocks.mapping`, evaluate the expression against the input → an object.
 * A bad mapping expression routes to the `error` handle (no `out` partial write).
 */
export function makeTransformHandler(): BlockHandler {
	return (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const mode = asString(sub.mode);

		if (mode === "template") {
			const template = asString(sub.template) ?? "";
			return {
				handle: "out",
				output: { text: renderTemplate(template, ctx.input) },
			};
		}

		// Default to mapping mode (registry's other declared mode).
		const mapping =
			sub.mapping && typeof sub.mapping === "object"
				? (sub.mapping as Record<string, unknown>)
				: {};
		const output: Record<string, unknown> = {};
		try {
			for (const [field, exprRaw] of Object.entries(mapping)) {
				const expr = asString(exprRaw);
				if (expr == null || expr.trim() === "") {
					output[field] = undefined;
					continue;
				}
				output[field] = evalExpression(expr, ctx.input);
			}
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "TRANSFORM_EXPR_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}
		return { handle: "out", output };
	};
}

/** Pull the string to parse: explicit `subBlocks.input`, else `input.text`/`input.body`. */
function resolveParserSource(
	sub: Record<string, unknown>,
	input: Record<string, unknown>,
): string | undefined {
	return asString(sub.input) ?? asString(input.text) ?? asString(input.body);
}

/**
 * Minimal RFC4180-ish CSV parser: handles quoted fields, escaped quotes (`""`),
 * and commas/newlines inside quotes. The first row is treated as the header; each
 * data row becomes an object keyed by the header. Kept native (no `papaparse`)
 * since the pipeline only needs straightforward header+rows parsing.
 */
export function parseCsv(text: string): Record<string, string>[] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				cell += ch;
			}
			continue;
		}
		if (ch === '"') {
			quoted = true;
		} else if (ch === ",") {
			row.push(cell);
			cell = "";
		} else if (ch === "\n" || ch === "\r") {
			// Swallow CRLF as a single break; ignore blank trailing rows.
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(cell);
			cell = "";
			if (row.length > 1 || row[0] !== "") rows.push(row);
			row = [];
		} else {
			cell += ch;
		}
	}
	if (cell !== "" || row.length > 0) {
		row.push(cell);
		if (row.length > 1 || row[0] !== "") rows.push(row);
	}
	const header = rows[0];
	if (header == null) return [];
	return rows.slice(1).map((cells) => {
		const obj: Record<string, string> = {};
		header.forEach((key, idx) => {
			obj[key] = cells[idx] ?? "";
		});
		return obj;
	});
}

/**
 * `parser` handler. Parses the source string per `subBlocks.format`:
 *  - `json`: `JSON.parse` → `{ value }`.
 *  - `csv`: native header+rows parse → `{ rows }`.
 *  - `regex`: extract groups of `subBlocks.pattern` → `{ match, groups }`.
 * Any parse failure (or missing source / unsupported format) routes to `error`.
 * `xml`/`yaml` are declared in the registry but not yet wired here — they error
 * rather than silently pass through (avoids pulling parser deps in this slice).
 */
export function makeParserHandler(): BlockHandler {
	return (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const format = (asString(sub.format) ?? "json").toLowerCase();
		const source = resolveParserSource(sub, ctx.input);

		if (source == null) {
			return {
				handle: "error",
				error: {
					code: "PARSER_INPUT_MISSING",
					message:
						"Parser node has no input string (subBlocks.input or input.text/body).",
					blockId: ctx.blockId,
				},
			};
		}

		try {
			if (format === "json") {
				return { handle: "out", output: { value: JSON.parse(source) } };
			}
			if (format === "csv") {
				return { handle: "out", output: { rows: parseCsv(source) } };
			}
			if (format === "regex") {
				const pattern = asString(sub.pattern);
				if (pattern == null || pattern === "") {
					throw new Error("Regex format requires subBlocks.pattern.");
				}
				const re = new RegExp(pattern, asString(sub.flags) ?? "");
				const m = re.exec(source);
				if (m == null) {
					throw new Error("Regex did not match the input.");
				}
				return {
					handle: "out",
					output: { match: m[0], groups: m.slice(1), named: m.groups ?? {} },
				};
			}
			throw new Error(`Unsupported parser format: ${format}.`);
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "PARSER_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}
	};
}

/**
 * `variable_set` handler. Reads `subBlocks.key` + `subBlocks.value`, evaluates
 * `value` as an `expr-eval` expression over the input when possible (so authors
 * can reference upstream fields), falling back to the literal string otherwise.
 * The result is written under `key` and merged onto the pass-through input, so
 * downstream nodes (which receive this block's `output`) see the variable.
 */
export function makeVariableSetHandler(): BlockHandler {
	return (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const key = asString(sub.key);
		if (key == null || key.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "VARIABLE_KEY_MISSING",
					message: "Variable Set node has no key (subBlocks.key).",
					blockId: ctx.blockId,
				},
			};
		}
		const valueRaw = asString(sub.value) ?? "";
		let value: unknown = valueRaw;
		// Best-effort expression evaluation: a literal that is not a valid
		// expression (e.g. plain text) falls back to the raw string.
		try {
			value = evalExpression(valueRaw, ctx.input);
		} catch {
			value = valueRaw;
		}
		return { handle: "out", output: { ...ctx.input, [key]: value } };
	};
}
