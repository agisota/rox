/**
 * Pure helpers for AI label suggestion from a chat transcript (Hermes-borrow
 * F14). Mirrors the auto-title pipeline (`@rox/chat` title-generation) but for
 * the *organization* tag axis: on settling, the model proposes 1–3 short labels
 * that the UI shows as dismissible ghost-chips.
 *
 * No DB, no tRPC ctx, no I/O — so the prompt assembly, model-output parsing, and
 * the manual-override reconcile are unit-testable without a live database or
 * gateway (mirrors `labels-schema.ts` / `notebooks/search-notes.ts`).
 *
 * Tags ⟂ identity: a suggested label is the organization axis only (a short
 * topic/theme), never the persona/org (who/where) axis.
 */

import { LABEL_NAME_MAX } from "./labels-schema";

/** Max number of labels the model may suggest in one pass (ghost-chip budget). */
export const MAX_SUGGESTED_LABELS = 3;

/** Cap on transcript characters fed to the model (mirrors title-gen's 2000). */
export const TRANSCRIPT_PROMPT_MAX_CHARS = 4_000;

/** One transcript turn the suggester reads (journal-readable `{role,content}`). */
export interface TranscriptTurn {
	role: "system" | "user" | "assistant";
	content: string;
}

/**
 * System instruction for the label-suggester agent. Asks for a strict
 * comma-separated list of 1–3 short topical tags in the transcript's language,
 * which `parseSuggestedLabels` then normalizes. Kept terse so the same prompt
 * works against the Rox house model and any per-user provider model.
 */
export const LABEL_SUGGESTION_INSTRUCTIONS = [
	"You label chat conversations with 1 to 3 short topical tags.",
	"Tags describe the SUBJECT of the conversation (e.g. billing, onboarding, bug, design).",
	"Never use a person's name, an organization name, or who is speaking.",
	"Each tag is 1-3 words, lowercase, in the same language as the conversation.",
	"Reply with ONLY the tags as a comma-separated list, nothing else.",
].join(" ");

/**
 * Flatten transcript turns into the single prompt string the suggester reads.
 * Keeps the most recent turns (the tail carries the settled topic), `role:`
 * prefixed like the title-gen rename path, capped to {@link
 * TRANSCRIPT_PROMPT_MAX_CHARS}. Returns `""` when there is no usable text so the
 * caller can skip the model call.
 */
export function buildLabelPrompt(turns: readonly TranscriptTurn[]): string {
	const lines: string[] = [];
	for (const turn of turns) {
		const content = turn.content.trim();
		if (content) {
			lines.push(`${turn.role}: ${content}`);
		}
	}
	const joined = lines.join("\n").trim();
	if (joined.length <= TRANSCRIPT_PROMPT_MAX_CHARS) {
		return joined;
	}
	// Keep the tail — the settled topic lives at the end of the conversation.
	return joined.slice(joined.length - TRANSCRIPT_PROMPT_MAX_CHARS).trim();
}

/** Normalize one raw model token into a label name, or `null` if unusable. */
function normalizeLabel(raw: string): string | null {
	const cleaned = raw
		// Strip list bullets / numbering / surrounding quotes & punctuation.
		.replace(/^[\s\-*•\d.)#"'`]+/, "")
		.replace(/["'`]+$/, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
	if (!cleaned) {
		return null;
	}
	return cleaned.length > LABEL_NAME_MAX
		? cleaned.slice(0, LABEL_NAME_MAX).trim()
		: cleaned;
}

/**
 * Parse a model completion into ≤{@link MAX_SUGGESTED_LABELS} normalized label
 * names. Splits on commas and newlines, normalizes each token, drops empties and
 * case-insensitive duplicates, and caps the count. Order-preserving.
 */
export function parseSuggestedLabels(completion: string): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const token of completion.split(/[,\n]/)) {
		const label = normalizeLabel(token);
		if (!label) {
			continue;
		}
		const key = label.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		out.push(label);
		if (out.length >= MAX_SUGGESTED_LABELS) {
			break;
		}
	}
	return out;
}

/**
 * Reconcile parsed suggestions against the labels already on the session,
 * respecting the manual override: never re-suggest a label the session already
 * carries (case-insensitively), so accepted/manual tags are never re-proposed
 * and the suggester can't overwrite or duplicate them. Returns the remaining
 * fresh suggestions (already capped by {@link parseSuggestedLabels}).
 */
export function reconcileSuggestions(
	suggested: readonly string[],
	existingLabels: readonly string[],
): string[] {
	const existing = new Set(
		existingLabels.map((name) => name.trim().toLowerCase()),
	);
	return suggested.filter((label) => !existing.has(label.toLowerCase()));
}
