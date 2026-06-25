import { Parser } from "expr-eval";
import type {
	BlockHandlerContext,
	BlockHandlerResult,
} from "../executor/types";

/**
 * A synchronous {@link BlockHandler}. The logic nodes (condition / switch /
 * merge / gate) branch purely on the merged input with no async port, so their
 * factories return this narrower type — it stays assignable to `BlockHandler`
 * (whose result is `BlockHandlerResult | Promise<…>`) while letting callers read
 * `.handle`/`.output` without awaiting.
 */
export type SyncBlockHandler = (ctx: BlockHandlerContext) => BlockHandlerResult;

/**
 * Shared safe expression parser for the logic handlers (condition / switch /
 * gate). `expr-eval` (MIT) evaluates a small arithmetic/boolean grammar with NO
 * `eval`/`Function` — the whole point of using it here. `allowMemberAccess`
 * lets authors read dotted paths off the merged upstream input (`user.age`,
 * `result.ok`); `assignment`/`fndef` are disabled so an expression can never
 * mutate the value scope or define functions. The instance is stateless and
 * reusable across evaluations.
 */
export const exprParser: Parser = new Parser({
	allowMemberAccess: true,
	operators: { assignment: false, fndef: false },
});

/**
 * Evaluate `expression` against `scope` and coerce the result to a boolean.
 * `expr-eval` returns numbers/strings/booleans; we apply JS truthiness so
 * `0`/`""`/`null`/`undefined`/`false` are falsy and everything else truthy.
 * Throws (with the parser's message) on a syntax error or unknown symbol so the
 * caller can route the failure to the `error` handle.
 */
export function evaluateBoolean(
	expression: string,
	scope: Record<string, unknown>,
): boolean {
	// expr-eval typings declare `evaluate` as `number`, but it returns the real
	// runtime value (boolean/string/number); cast through unknown to read it.
	const value = exprParser.evaluate(expression, scope as never) as unknown;
	return Boolean(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/**
 * Build the `condition` block handler. Reads the boolean expression from the
 * node config (`subBlocks.expression`, alias `condition`) and evaluates it over
 * the merged upstream input with the safe {@link exprParser}. Fires the `true`
 * or `false` output handle accordingly; the executor prunes the untaken branch
 * (handle-driven routing). A missing expression or an evaluation error routes to
 * the `error` handle so a malformed node fails loudly instead of silently
 * taking a default branch.
 */
export function makeConditionHandler(): SyncBlockHandler {
	return (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const expression = asString(sub.expression) ?? asString(sub.condition);

		if (expression == null || expression.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "CONDITION_EXPRESSION_MISSING",
					message:
						"Condition node has no expression configured (subBlocks.expression).",
					blockId: ctx.blockId,
				},
			};
		}

		let result: boolean;
		try {
			result = evaluateBoolean(expression, ctx.input);
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "CONDITION_EVAL_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}

		return {
			handle: result ? "true" : "false",
			output: { result, input: ctx.input },
		};
	};
}
