/**
 * Pure, framework-agnostic descriptors + derivations for the unified chat
 * `SessionRow` (Hermes-borrow F20). No DOM, no React, no I/O — so the same
 * `(data, density)` derives byte-identical chips/dot/badges on web, desktop, and
 * mobile (RN reuses this contract behind a native row). This is the "one core"
 * act: the row's *shape* lives here once and every surface renders it.
 *
 * The contract is intentionally rich but mostly optional: `chat.listSessions`
 * today carries `title`/`pinned`/`labels`/`updatedAt`, while source chips,
 * lineage/fork, and worktree/branch are forward-compatible props a surface fills
 * in when it has them. Absent fields simply render nothing — no DB migration
 * needed for the row to support them.
 */

/** A coloured label dot for the row (F12 — colour comes from `labelColor`). */
export interface SessionRowLabel {
	/** Stable key (the label name; also the `chat_sessions.labels` membership). */
	name: string;
	/** Ready-to-use CSS colour for the dot (already resolved via `labelColor`). */
	color: string;
}

/** Where a session originated — drives the source chip glyph + text. */
export type SessionSource =
	| "cli"
	| "claude-code"
	| "telegram"
	| "discord"
	| "slack";

/** Lineage for the fork badge: a `root` shows nothing, a `fork` shows the badge. */
export interface SessionRowLineage {
	kind: "root" | "fork";
	/** Optional parent title surfaced in the fork badge tooltip. */
	parentTitle?: string;
}

/**
 * The full presentational contract for one chat row. Everything beyond
 * `sessionId`/`title`/`isCurrent` is optional so a surface only supplies what it
 * has; the row degrades gracefully (no chip/dot/badge when data is absent).
 */
export interface SessionRowData {
	sessionId: string;
	title: string;
	/** Current/active session → bold title + active styling. */
	isCurrent: boolean;
	/** F19 pin state. Omit to hide the pin affordance entirely. */
	pinned?: boolean;
	/** F12 colour dots for the session's labels (first few shown; rest collapsed). */
	labels?: readonly SessionRowLabel[];
	/** Origin chips (CLI/Claude Code/Telegram/Discord/Slack). */
	sources?: readonly SessionSource[];
	/** Fork/lineage badge; `root` (or absent) renders no badge. */
	lineage?: SessionRowLineage;
	/** Worktree label shown in the detailed density. */
	worktree?: string | null;
	/** Git branch shown in the detailed density. */
	branch?: string | null;
	/** Last-active time, pre-formatted by the surface for the time column. */
	timeLabel?: string | null;
}

/** Row density: `compact` is the dropdown row, `detailed` adds meta rows. */
export type SessionRowDensity = "compact" | "detailed";

/** Human label + a11y text for a source chip. */
export interface SourceChipDescriptor {
	source: SessionSource;
	/** Short visible label (e.g. "CLI", "Claude Code"). */
	label: string;
}

const SOURCE_LABELS: Record<SessionSource, string> = {
	cli: "CLI",
	"claude-code": "Claude Code",
	telegram: "Telegram",
	discord: "Discord",
	slack: "Slack",
};

/** Resolve the visible label for a source chip. */
export function sourceLabel(source: SessionSource): string {
	return SOURCE_LABELS[source];
}

/**
 * Derive the ordered, de-duplicated source chips for a row. Order follows the
 * incoming list (caller-meaningful), duplicates dropped so a doubly-tagged
 * session never renders the same chip twice.
 */
export function deriveSourceChips(
	sources: readonly SessionSource[] | undefined,
): SourceChipDescriptor[] {
	if (!sources || sources.length === 0) return [];

	const seen = new Set<SessionSource>();
	const chips: SourceChipDescriptor[] = [];
	for (const source of sources) {
		if (seen.has(source)) continue;
		seen.add(source);
		chips.push({ source, label: SOURCE_LABELS[source] });
	}
	return chips;
}

/** Cap on visible label dots before collapsing the rest into a "+N" count. */
export const LABEL_DOT_CAP = 3;

/** The label dots to render plus how many overflowed (collapsed into "+N"). */
export interface LabelDotsLayout {
	dots: SessionRowLabel[];
	overflow: number;
}

/**
 * Split the session's labels into the first `cap` coloured dots and an overflow
 * count, so a heavily-labelled session can't blow out the row width. Pure so the
 * same `(labels, cap)` lays out identically on every surface.
 */
export function deriveLabelDots(
	labels: readonly SessionRowLabel[] | undefined,
	cap: number = LABEL_DOT_CAP,
): LabelDotsLayout {
	if (!labels || labels.length === 0) return { dots: [], overflow: 0 };
	const dots = labels.slice(0, cap);
	return { dots, overflow: Math.max(0, labels.length - dots.length) };
}

/** Whether the fork badge should render (only for an explicit `fork` lineage). */
export function showsForkBadge(
	lineage: SessionRowLineage | undefined,
): boolean {
	return lineage?.kind === "fork";
}

/** Whether the worktree/branch meta row has anything to show (detailed only). */
export function hasWorktreeMeta(data: SessionRowData): boolean {
	return Boolean(data.worktree?.trim() || data.branch?.trim());
}
