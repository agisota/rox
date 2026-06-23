import type { UIMessage } from "ai";
import { getToolName, isToolUIPart } from "ai";

/**
 * Compute a render key for every message part that is stable across streaming
 * re-renders, independent of the part's position in the emitted node list.
 *
 * ## Why this exists (the jitter bug)
 *
 * The renderer collapses a *variable-length* run of consecutive read-only tool
 * parts (read_file / list_files / file_stat / search / index — the "Listed
 * files" cards) into a single `ExploringGroup` node. While the agent streams,
 * that run grows part-by-part, so the number of emitted nodes — and therefore
 * any array-index–based key (`key={i}`, `explore-${groupStart}`) — shifts under
 * the existing rows.
 *
 * React treats a changed key as a brand-new element: it unmounts the old node
 * and mounts a fresh one. Every chat card is wrapped in an entrance animation
 * (`ToolCardMotion` fades up from `y:4`, `MessageRow` from `y:8`), so a remount
 * *replays that upward slide* — the transcript visibly jumps up and down.
 *
 * Keying each part by a value derived from the part itself (a tool's stable
 * `toolCallId`, or a per-type ordinal for text/reasoning/error/etc.) keeps node
 * identity constant as the stream appends, so existing rows reflow smoothly via
 * `layout="position"` instead of remounting.
 *
 * Append-only invariant: the AI SDK only ever *appends* new parts to a message
 * (and mutates the text of the trailing part in place); it never inserts or
 * reorders earlier parts. So a part's tool id — or its ordinal among same-typed
 * parts — is stable for the lifetime of that part.
 *
 * @returns an array parallel to `parts`; `keys[i]` is the stable key for the
 * part at index `i`. For a grouped run, use the key of the group's first member
 * (`keys[groupStart]`) so the group node keeps the identity of the read-only
 * card that opened the run.
 */
export function computeStablePartKeys(parts: UIMessage["parts"]): string[] {
	const typeCounts = new Map<string, number>();
	const keys: string[] = new Array(parts.length);

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];

		if (isToolUIPart(part)) {
			const toolCallId = (part as { toolCallId?: string }).toolCallId;
			// toolCallId is always present for a tool UI part, but fall back to a
			// type+ordinal key so we never produce an undefined/duplicate key.
			if (toolCallId) {
				keys[i] = `tool-${toolCallId}`;
				continue;
			}
			const toolName = getToolName(part);
			const typeKey = `tool:${toolName}`;
			const ordinal = typeCounts.get(typeKey) ?? 0;
			typeCounts.set(typeKey, ordinal + 1);
			keys[i] = `tool-${toolName}-${ordinal}`;
			continue;
		}

		const type = (part as { type: string }).type;
		const ordinal = typeCounts.get(type) ?? 0;
		typeCounts.set(type, ordinal + 1);
		keys[i] = `${type}-${ordinal}`;
	}

	return keys;
}
