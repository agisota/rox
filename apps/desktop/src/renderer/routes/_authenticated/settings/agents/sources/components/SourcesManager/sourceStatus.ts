import {
	type AgentSourceKind,
	type AgentSourceStatus,
	agentSourceStatusValues,
} from "@rox/db/enums";

/**
 * Pure presentation helpers for the sources list — RU labels for kind/status and
 * the badge tone per lifecycle state. Dependency-free so the list view stays a
 * thin render layer and the label/tone mapping is unit-testable.
 *
 * Desktop parity port of the web
 * `apps/web/src/app/(agents)/agents/sources/components/SourcesManager/sourceStatus.ts`
 * — copied verbatim (no React/tRPC) so both platforms share the exact same
 * label/transition semantics over the cross-platform `agentSource` CRUD.
 */

const STATUS_LABELS: Record<AgentSourceStatus, string> = {
	draft: "Черновик",
	active: "Активен",
	deprecated: "Устаревает",
	archived: "В архиве",
};

const KIND_LABELS: Record<AgentSourceKind, string> = {
	claude_code: "Claude Code",
	codex: "Codex",
	cursor: "Cursor",
	opencode: "OpenCode",
	mcp: "MCP-сервер",
	external_http: "Внешний HTTP",
};

export type StatusBadgeVariant =
	| "default"
	| "secondary"
	| "outline"
	| "destructive";

const STATUS_BADGE_VARIANTS: Record<AgentSourceStatus, StatusBadgeVariant> = {
	draft: "outline",
	active: "default",
	deprecated: "secondary",
	archived: "destructive",
};

export function statusLabel(status: AgentSourceStatus): string {
	return STATUS_LABELS[status];
}

export function kindLabel(kind: AgentSourceKind): string {
	return KIND_LABELS[kind];
}

export function statusBadgeVariant(
	status: AgentSourceStatus,
): StatusBadgeVariant {
	return STATUS_BADGE_VARIANTS[status];
}

/** Every status the management view can transition a source to. */
export const ALL_STATUSES = agentSourceStatusValues;

/**
 * Statuses a source can move to from its current one — every status except the
 * one it already has (the `setStatus` router accepts any valid status; we just
 * hide the no-op self-transition from the menu).
 */
export function statusTransitions(
	current: AgentSourceStatus,
): AgentSourceStatus[] {
	return ALL_STATUSES.filter((status) => status !== current);
}
