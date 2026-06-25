/**
 * Pure helper: a compact, human-facing summary of a node's bound config, shown
 * in the node body so the canvas reads at a glance (dify/sim parity) without
 * opening the inspector. Kept pure + framework-free so it is unit-tested in
 * isolation and shared by any node surface.
 */

import type { NodeTypeDefinition } from "@rox/workflow-core";

/** One summarised config line: the field label + its rendered value. */
export type ConfigSummaryLine = { label: string; value: string };

const MAX_LINES = 3;
const MAX_VALUE_LEN = 40;

function renderValue(raw: unknown): string | null {
	if (raw == null) return null;
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (trimmed.length === 0) return null;
		return trimmed.length > MAX_VALUE_LEN
			? `${trimmed.slice(0, MAX_VALUE_LEN - 1)}…`
			: trimmed;
	}
	if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
	if (Array.isArray(raw)) return raw.length > 0 ? `${raw.length} элем.` : null;
	if (typeof raw === "object") {
		const count = Object.keys(raw as Record<string, unknown>).length;
		return count > 0 ? `${count} ключ(а/ей)` : null;
	}
	return null;
}

/**
 * Summarise up to {@link MAX_LINES} of a node's set config fields (in field
 * order), skipping empty/absent values. Long strings are truncated; objects and
 * arrays render a compact count. Returns `[]` when nothing is configured.
 */
export function nodeConfigSummary(
	def: NodeTypeDefinition,
	subBlocks: Record<string, unknown> | undefined,
): ConfigSummaryLine[] {
	if (!subBlocks) return [];
	const lines: ConfigSummaryLine[] = [];
	for (const field of def.fields) {
		if (lines.length >= MAX_LINES) break;
		// `roleSlug` is surfaced as its own badge by the renderer; skip here.
		if (field.key === "roleSlug") continue;
		const value = renderValue(subBlocks[field.key]);
		if (value == null) continue;
		lines.push({ label: field.label, value });
	}
	return lines;
}
