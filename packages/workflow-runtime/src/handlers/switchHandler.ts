import type { BlockHandlerContext } from "../executor/types";
import { exprParser, type SyncBlockHandler } from "./conditionHandler";

/**
 * A single `switch` branch. `id` is the output handle the executor routes to
 * when this case matches; `value` is the literal compared against the resolved
 * selector. Authored in the NodeInspector as `subBlocks.cases`.
 */
export interface SwitchCase {
	id: string;
	value: unknown;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/**
 * Normalize the authored `subBlocks.cases` into typed {@link SwitchCase}s,
 * dropping anything without a usable string `id`. Tolerant of jsonb shape: each
 * entry may carry `value` (or its alias `match`).
 */
export function parseSwitchCases(raw: unknown): SwitchCase[] {
	if (!Array.isArray(raw)) return [];
	const cases: SwitchCase[] = [];
	for (const entry of raw) {
		if (entry == null || typeof entry !== "object") continue;
		const rec = entry as Record<string, unknown>;
		const id = asString(rec.id);
		if (id == null || id === "") continue;
		cases.push({ id, value: "value" in rec ? rec.value : rec.match });
	}
	return cases;
}

/**
 * Resolve the selector the switch matches on. Prefers an expression
 * (`subBlocks.value`/`expression`/`selector`) evaluated over the merged input
 * with the safe parser; falls back to a dotted field path (`subBlocks.field`)
 * read straight off the input. Returns `undefined` when nothing is configured.
 */
function resolveSelector(
	sub: Record<string, unknown>,
	input: Record<string, unknown>,
): unknown {
	const expression =
		asString(sub.value) ?? asString(sub.expression) ?? asString(sub.selector);
	if (expression != null && expression.trim() !== "") {
		return exprParser.evaluate(expression, input as never) as unknown;
	}
	const field = asString(sub.field);
	if (field != null && field.trim() !== "") {
		let cur: unknown = input;
		for (const key of field.split(".")) {
			if (cur == null || typeof cur !== "object") return undefined;
			cur = (cur as Record<string, unknown>)[key];
		}
		return cur;
	}
	return undefined;
}

/** Loose equality across primitives; deep-equals objects via JSON for jsonb. */
function valuesMatch(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	// Author values arrive as jsonb; compare numbers/strings cross-type by string
	// form so a numeric selector matches a string-authored case (and vice versa).
	if (
		(typeof a === "number" ||
			typeof a === "string" ||
			typeof a === "boolean") &&
		(typeof b === "number" || typeof b === "string" || typeof b === "boolean")
	) {
		return String(a) === String(b);
	}
	if (
		a != null &&
		b != null &&
		typeof a === "object" &&
		typeof b === "object"
	) {
		return JSON.stringify(a) === JSON.stringify(b);
	}
	return false;
}

/**
 * Build the `switch` block handler. Resolves the selector value (expression or
 * field) over the merged upstream input, then fires the handle of the first
 * matching {@link SwitchCase}; with no match it fires `default`. The matched
 * value is echoed on the output so a downstream merge/response can read it. A
 * selector evaluation error routes to the `error` handle.
 */
export function makeSwitchHandler(): SyncBlockHandler {
	return (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const cases = parseSwitchCases(sub.cases);

		let selector: unknown;
		try {
			selector = resolveSelector(sub, ctx.input);
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "SWITCH_EVAL_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}

		const matched = cases.find((c) => valuesMatch(selector, c.value));
		const handle = matched?.id ?? "default";
		return {
			handle,
			output: { handle, value: selector, input: ctx.input },
		};
	};
}
