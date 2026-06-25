import { z } from "zod";

/**
 * Canonical chat permission mode for the desktop agent.
 *
 * The agent has filesystem/shell access, so the permission mode gates whether a
 * tool call (edit/execute/…) runs straight through or stops at an approval gate.
 * This is the single cross-platform source of truth: the desktop renderer, the
 * host-service tRPC turn schema, and the runtime all import from here so a turn's
 * selected mode means the same thing end-to-end (and a future web/mobile client
 * reuses the same contract).
 *
 * - `default` — every tool requires confirmation (manual / safest).
 * - `acceptEdits` — file edits auto-apply; everything else still asks
 *   (semi-auto).
 * - `bypassPermissions` — nothing asks (auto / "yolo").
 */
export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

/** All permission modes, ordered safest → least safe. */
export const PERMISSION_MODES: readonly PermissionMode[] = [
	"default",
	"acceptEdits",
	"bypassPermissions",
];

/**
 * The safe default. Deliberately NOT `bypassPermissions`: a fresh session must
 * never silently grant the agent unconfirmed filesystem/shell access.
 */
export const DEFAULT_PERMISSION_MODE: PermissionMode = "default";

/** Zod schema for the turn-metadata `permissionMode` field. */
export const permissionModeSchema = z.enum([
	"default",
	"acceptEdits",
	"bypassPermissions",
]);

/** Narrow an unknown value to a {@link PermissionMode}. */
export function isPermissionMode(value: unknown): value is PermissionMode {
	return (
		typeof value === "string" &&
		PERMISSION_MODES.includes(value as PermissionMode)
	);
}

/**
 * Permission policy, mirroring mastracode's `PermissionPolicy`. Re-declared here
 * (rather than imported from `@mastra/core/harness`) so the shared contract stays
 * free of the engine dependency; the runtime asserts compatibility at the call
 * site by assigning the result into `engine.setState`.
 */
type PermissionPolicy = "allow" | "ask" | "deny";

/**
 * The harness-state slice a permission mode maps to. The runtime applies this via
 * `engine.setState(...)` before a turn runs so the harness's approval resolver
 * enforces the chosen mode (`yolo` short-circuits every gate; otherwise the
 * per-category policy decides allow vs. ask).
 */
export interface PermissionModeHarnessState {
	/** When true, every tool auto-approves (maps to `bypassPermissions`). */
	yolo: boolean;
	// Records are string-keyed with defined (non-optional) policy values so they
	// assign directly to the harness state's `Record<string, PermissionPolicy>`;
	// an unset category/tool is simply an absent key, not an `undefined` value.
	permissionRules: {
		categories: Record<string, PermissionPolicy>;
		tools: Record<string, PermissionPolicy>;
	};
}

/**
 * Translate a {@link PermissionMode} into the harness state the runtime applies.
 *
 * - `bypassPermissions` → `yolo: true` (resolver short-circuits to allow).
 * - `acceptEdits` → `yolo: false`, `edit` category auto-allowed, the rest fall
 *   back to the harness default (`ask`).
 * - `default` → `yolo: false`, no category overrides → every gate asks.
 *
 * Returning explicit (empty) `permissionRules` for every mode keeps the call
 * idempotent: switching modes mid-session always clears stale category grants
 * instead of leaving an earlier mode's edit-allow in place.
 */
export function permissionModeToHarnessState(
	mode: PermissionMode,
): PermissionModeHarnessState {
	switch (mode) {
		case "bypassPermissions":
			return { yolo: true, permissionRules: { categories: {}, tools: {} } };
		case "acceptEdits":
			return {
				yolo: false,
				permissionRules: { categories: { edit: "allow" }, tools: {} },
			};
		default:
			return { yolo: false, permissionRules: { categories: {}, tools: {} } };
	}
}
