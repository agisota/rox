import type { PermissionMode } from "@rox/shared/chat-permission-mode";
import { usePermissionModePreferenceStore } from "./store";

/**
 * Read + update the persisted composer permission mode.
 *
 * Returns a `[value, setValue]` tuple so it slots into the existing
 * `ChatInputFooter`/`ChatComposerControls` props (which expect a
 * `Dispatch`-style setter) without reshaping their interfaces. Both chat panes
 * (v2 + legacy) call this so they share one persisted preference.
 */
export function usePermissionModePreference(): [
	PermissionMode,
	(mode: PermissionMode) => void,
] {
	const permissionMode = usePermissionModePreferenceStore(
		(state) => state.permissionMode,
	);
	const setPermissionMode = usePermissionModePreferenceStore(
		(state) => state.setPermissionMode,
	);
	return [permissionMode, setPermissionMode];
}
