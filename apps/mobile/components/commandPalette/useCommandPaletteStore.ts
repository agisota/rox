import {
	createContext,
	createElement,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";

/**
 * Open/close state for the mobile command palette sheet, shared between the
 * trigger (FAB / long-press) and the sheet via React context. No external state
 * library is added — mobile does not depend on zustand.
 */
interface CommandPaletteState {
	open: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteState | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const value = useMemo<CommandPaletteState>(
		() => ({ open, setOpen, toggle: () => setOpen((prev) => !prev) }),
		[open],
	);
	return createElement(CommandPaletteContext.Provider, { value }, children);
}

export function useCommandPalette(): CommandPaletteState {
	const ctx = useContext(CommandPaletteContext);
	if (!ctx) {
		throw new Error(
			"useCommandPalette must be used within a CommandPaletteProvider",
		);
	}
	return ctx;
}
