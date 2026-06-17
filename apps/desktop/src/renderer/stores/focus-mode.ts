import { create } from "zustand";

/**
 * Focus-mode store (custom-loading-screens epic).
 *
 * Drives the standalone full-screen quote experience opened from the command
 * palette. A tiny global toggle so the command (which runs outside React) and
 * the overlay component can talk without prop drilling.
 */
interface FocusModeState {
	/** Whether the full-screen focus quote overlay is shown. */
	isOpen: boolean;
	/** Open the focus overlay. */
	open: () => void;
	/** Close the focus overlay. */
	close: () => void;
}

export const useFocusModeStore = create<FocusModeState>((set) => ({
	isOpen: false,
	open: () => set({ isOpen: true }),
	close: () => set({ isOpen: false }),
}));
