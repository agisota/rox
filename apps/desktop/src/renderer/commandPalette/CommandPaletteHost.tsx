import { type ReactNode, useEffect } from "react";
import { useHotkey } from "renderer/hotkeys";
import { CommandContextProvider } from "./core/ContextProvider";
import { useFrameStackStore } from "./core/frames";
import { registerAllModules } from "./modules";
import { CommandPalette } from "./ui/CommandPalette/CommandPalette";
import { DeleteWorkspaceMount } from "./ui/DeleteWorkspaceMount/DeleteWorkspaceMount";
import { RemoveFromSidebarMount } from "./ui/RemoveFromSidebarMount/RemoveFromSidebarMount";
import { SetPreferredOpenInAppMount } from "./ui/SetPreferredOpenInAppMount/SetPreferredOpenInAppMount";

export function CommandPaletteHost({ children }: { children?: ReactNode }) {
	useEffect(() => {
		const unregister = registerAllModules();
		return unregister;
	}, []);

	return (
		<CommandContextProvider>
			<CommandPaletteTrigger />
			<CapsLockTrigger />
			<CommandPalette />
			<DeleteWorkspaceMount />
			<RemoveFromSidebarMount />
			<SetPreferredOpenInAppMount />
			{children}
		</CommandContextProvider>
	);
}

function CommandPaletteTrigger() {
	const setOpen = useFrameStackStore((s) => s.setOpen);
	useHotkey("OPEN_COMMAND_PALETTE", () => setOpen(true));
	return null;
}

/**
 * CAPS LOCK opens the command palette (the primary "summon Rox" action).
 *
 * CapsLock is a lock key, not a standard accelerator modifier — Electron's
 * `globalShortcut` and the app's chord registry both reject it (see
 * `LOCK_KEYS` in hotkeys/utils/resolveHotkeyFromEvent.ts), so it can't go
 * through `useHotkey`. We bind it directly at the renderer with a `keydown`
 * listener matching `event.code === "CapsLock"`.
 *
 * macOS caveat: the OS toggles the Caps Lock LED/state on press and the
 * matching `keyup` is unreliable, so we trigger on `keydown` (which fires
 * reliably). If a user has remapped Caps Lock at the OS level (e.g. to
 * Control via System Settings → Keyboard → Modifier Keys), the browser
 * never sees a `CapsLock` code and this binding silently does nothing —
 * the standard ⌘⇧K accelerator remains available as a fallback.
 */
function CapsLockTrigger() {
	const setOpen = useFrameStackStore((s) => s.setOpen);
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (event.code !== "CapsLock") return;
			if (event.isComposing || event.keyCode === 229) return;
			event.preventDefault();
			setOpen(true);
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [setOpen]);
	return null;
}
