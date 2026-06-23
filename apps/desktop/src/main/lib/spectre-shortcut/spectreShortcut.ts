import type { GlobalShortcut } from "electron";

/** Cmd/Ctrl + \  — summon/hide the Spectre overlay from any app. */
export const SPECTRE_SUMMON_ACCELERATOR = "CommandOrControl+\\";

export interface RegisterSpectreShortcutDeps {
	globalShortcut: GlobalShortcut;
	onToggle: () => void;
}

/** Returns true if the accelerator was claimed; false if the OS rejected it. */
export function registerSpectreShortcut(
	deps: RegisterSpectreShortcutDeps,
): boolean {
	const { globalShortcut, onToggle } = deps;
	return globalShortcut.register(SPECTRE_SUMMON_ACCELERATOR, onToggle);
}

export function unregisterSpectreShortcut(globalShortcut: GlobalShortcut): void {
	globalShortcut.unregister(SPECTRE_SUMMON_ACCELERATOR);
}
