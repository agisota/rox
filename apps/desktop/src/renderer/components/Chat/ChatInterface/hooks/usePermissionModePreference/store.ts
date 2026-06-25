import {
	DEFAULT_PERMISSION_MODE,
	isPermissionMode,
	type PermissionMode,
} from "@rox/shared/chat-permission-mode";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * Persisted permission-mode preference for the workspace chat composer.
 *
 * The composer's `permissionMode` was previously held in component `useState`
 * hardwired to `"bypassPermissions"`: it neither persisted across sessions nor
 * defaulted to a safe value, which is a real security hole for a desktop agent
 * with filesystem/shell access. We persist it here (one localStorage key shared
 * by BOTH the v2 and legacy chat panes) so the chosen mode survives a session /
 * app restart everywhere.
 *
 * Default is the SAFER `"default"` (every tool requires confirmation) rather
 * than the previous silent `"bypassPermissions"`.
 */
interface PermissionModePreferenceState {
	permissionMode: PermissionMode;
	setPermissionMode: (mode: PermissionMode) => void;
}

export const usePermissionModePreferenceStore =
	create<PermissionModePreferenceState>()(
		devtools(
			persist(
				(set) => ({
					permissionMode: DEFAULT_PERMISSION_MODE,
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
