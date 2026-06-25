/**
 * F39 — Activity bucketing selector (pure, framework-agnostic).
 *
 * Flattens a sequence of tool calls and buckets *consecutive runs of the same
 * verb* into Activity groups carrying a `verb + count + tense` summary. Used by
 * the desktop renderer, the shared `ActivityWorklog` component, and the RN
 * adapter — all from one implementation.
 *
 * Bucketing is run-aware (consecutive same-verb calls collapse together) rather
 * than global-per-verb, so the timeline preserves the order in which the agent
 * actually worked instead of reordering everything by category.
 */

import {
	type ActivityTense,
	type ActivityVerb,
	formatActivitySummary,
	mapToolToVerb,
} from "./activity-verbs";

/**
 * The minimal, serializable shape a tool call must expose to be bucketed. Any
 * runtime (AI-SDK `UIMessage` parts, desktop `tool_call` content, RN model) can
 * project onto this without importing UI types.
 */
export interface ActivityToolCall {
	/** Stable id used as the group/run key and for de-duplication. */
	id: string;
	/** Normalized tool name (see `mapToolToVerb`). */
	name: string;
	/** True while the call is still running (input-streaming / no result yet). */
	isPending: boolean;
	/** True when the call finished with an error. */
	isError: boolean;
	/** Optional one-line detail (path / query / command) for the expanded row. */
	detail?: string;
}

/** One bucketed run of consecutive same-verb tool calls. */
export interface ActivityGroup {
	/** Stable id — the first call's id in the run. */
	id: string;
	verb: ActivityVerb;
	/** Number of tool calls in this run. */
	count: number;
	/** `present` while any call in the run is still pending, else `past`. */
	tense: ActivityTense;
	/** True when any call in the run errored. */
	hasError: boolean;
	/** "tense + count" summary string, e.g. `Прочитано · 3 файла`. */
	summary: string;
	/** The individual calls, in order, for the expanded detail rows. */
	calls: ActivityToolCall[];
}

/**
 * Buckets a flat, ordered list of tool calls into Activity groups. Consecutive
 * calls sharing a verb merge into one group; a verb change (or a gap) starts a
 * new group.
 */
export function bucketActivityToolCalls(
	toolCalls: ActivityToolCall[],
): ActivityGroup[] {
	const groups: ActivityGroup[] = [];
	let current: { verb: ActivityVerb; calls: ActivityToolCall[] } | null = null;

	for (const call of toolCalls) {
		const verb = mapToolToVerb(call.name);
		if (current && current.verb === verb) {
			current.calls.push(call);
			continue;
		}
		if (current) {
			groups.push(finalizeGroup(current.verb, current.calls));
		}
		current = { verb, calls: [call] };
	}
	if (current) {
		groups.push(finalizeGroup(current.verb, current.calls));
	}

	return groups;
}

function finalizeGroup(
	verb: ActivityVerb,
	calls: ActivityToolCall[],
): ActivityGroup {
	const hasPending = calls.some((c) => c.isPending);
	const hasError = calls.some((c) => c.isError);
	const tense: ActivityTense = hasPending ? "present" : "past";
	const first = calls[0];
	if (!first) {
		throw new Error("finalizeGroup called with no tool calls");
	}
	return {
		id: first.id,
		verb,
		count: calls.length,
		tense,
		hasError,
		summary: formatActivitySummary({ verb, count: calls.length, tense }),
		calls,
	};
}
