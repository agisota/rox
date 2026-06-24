import type { PermissionMode } from "renderer/components/Chat/ChatInterface/types";
import { usePermissionModePreferenceStore } from "./store";

/**
 * Read + update the persisted composer permission mode.
 *
 * Returns a `[value, setValue]` tuple so it slots into the existing
 * `ChatInputFooter`/`ChatComposerControls` props (which expect a
 * `Dispatch`-style setter) without reshaping their interfaces.
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
