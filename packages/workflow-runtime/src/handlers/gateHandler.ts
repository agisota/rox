import type { BlockHandlerContext } from "../executor/types";
import { evaluateBoolean, type SyncBlockHandler } from "./conditionHandler";

/**
 * A single `gate`/`route` branch: fire output handle `id` when its boolean
 * `when` expression evaluates truthy over the merged input. Authored as
 * `subBlocks.routes`. An entry without a `when` (or with an empty one) is the
 * catch-all and always matches — use it as the last route to act as `default`.
 */
export interface GateRoute {
	id: string;
	when?: string;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/**
 * Normalize the authored `subBlocks.routes` into typed {@link GateRoute}s,
 * dropping anything without a usable string `id`. `when` is optional (alias
 * `condition`/`expression`); a missing predicate makes the route a catch-all.
 */
export function parseGateRoutes(raw: unknown): GateRoute[] {
	if (!Array.isArray(raw)) return [];
	const routes: GateRoute[] = [];
	for (const entry of raw) {
		if (entry == null || typeof entry !== "object") continue;
		const rec = entry as Record<string, unknown>;
		const id = asString(rec.id);
		if (id == null || id === "") continue;
		const when =
			asString(rec.when) ?? asString(rec.condition) ?? asString(rec.expression);
		routes.push({ id, when });
	}
	return routes;
}

/**
 * Build the `gate`/`route` block handler — a multi-way router. Evaluates each
 * configured {@link GateRoute}'s `when` predicate (safe parser, no `eval`) over
 * the merged upstream input in order and fires the first route whose predicate
 * is truthy; a route without a predicate is a catch-all. With no route matching
 * it falls back to the `default` handle, so an unrouted input still leaves the
 * node deterministically. A predicate evaluation error routes to `error`.
 */
export function makeGateHandler(): SyncBlockHandler {
	return (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const routes = parseGateRoutes(sub.routes);

		try {
			for (const route of routes) {
				const matches =
					route.when == null || route.when.trim() === ""
						? true
						: evaluateBoolean(route.when, ctx.input);
				if (matches) {
					return {
						handle: route.id,
						output: { handle: route.id, input: ctx.input },
					};
				}
			}
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "GATE_EVAL_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}

		return {
			handle: "default",
			output: { handle: "default", input: ctx.input },
		};
	};
}
