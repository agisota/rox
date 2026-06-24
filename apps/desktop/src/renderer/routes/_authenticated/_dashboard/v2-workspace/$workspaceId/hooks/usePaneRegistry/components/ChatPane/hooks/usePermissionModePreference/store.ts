import type { PermissionMode } from "renderer/components/Chat/ChatInterface/types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * Persisted permission-mode preference for the canonical workspace chat.
 *
 * The composer's `permissionMode` was previously held in component `useState`
 * hardwired to `"bypassPermissions"` (see the v2 ChatPane gap in the surfaces
 * spec): it neither persisted across sessions nor defaulted to a safe value,
 * which is a real security hole for a desktop agent with filesystem/shell
 * access. We persist it here instead of in the shared `chat-preferences` store
 * so this surface fix stays self-contained.
 *
 * Default is the SAFER `"default"` (every tool requires confirmation) rather
 * than the previous silent `"bypassPermissions"`.
 */
interface PermissionModePreferenceState {
	permissionMode: PermissionMode;
	setPermissionMode: (mode: PermissionMode) => void;
}

const VALID_PERMISSION_MODES: readonly PermissionMode[] = [
	"default",
	"acceptEdits",
	"bypassPermissions",
];

function isPermissionMode(value: unknown): value is PermissionMode {
	return (
		typeof value === "string" &&
		VALID_PERMISSION_MODES.includes(value as PermissionMode)
	);
}

export const usePermissionModePreferenceStore =
	create<PermissionModePreferenceState>()(
		devtools(
			persist(
				(set) => ({
					permissionMode: "default" as PermissionMode,
					setPermissionMode: (permissionMode) => {
						set({ permissionMode });
					},
				}),
				{
					name: "rox-chat-permission-mode",
					// Guard against a corrupted/legacy persisted value snapping the
					// composer into an unknown mode.
					merge: (persisted, current) => {
						const next = { ...current };
						if (
							persisted &&
							typeof persisted === "object" &&
							isPermissionMode(
								(persisted as Partial<PermissionModePreferenceState>)
									.permissionMode,
							)
						) {
							next.permissionMode = (
								persisted as PermissionModePreferenceState
							).permissionMode;
						}
						return next;
					},
				},
			),
			{ name: "ChatPermissionModeStore" },
		),
	);
