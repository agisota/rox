import type { PopoutWindowManager } from "main/windows/popout";
import { popoutWindowId } from "shared/types/popout";
import { z } from "zod";
import { publicProcedure, router } from "..";

// Module-level handle set from main/index.ts once the manager is constructed,
// so the renderer can drive tear-off / popout windows. Mirrors the spectre
// router's `setSpectreManager` pattern.
let popoutManager: PopoutWindowManager | null = null;
export function setPopoutManager(mgr: PopoutWindowManager): void {
	popoutManager = mgr;
}

const popoutPayloadSchema = z.object({
	workspaceId: z.string().min(1),
	paneId: z.string().min(1),
	kind: z.enum(["chat", "file-tree", "terminal"]),
	// Serialized `@rox/panes` layout snapshot the popout rehydrates from.
	paneLayoutJson: z.string(),
});

/**
 * tRPC router for desktop tear-off / popout windows (F52).
 *
 * The renderer (a pane's "pop out" affordance) calls `openPane` with the pane
 * identity and a serialized `paneLayout` snapshot; the main process opens (or
 * focuses) an id-keyed glass window that rehydrates that snapshot. All
 * procedures are plain mutations/queries — no subscriptions here, so the
 * observable-only constraint of trpc-electron is moot for this router; the live
 * cross-window state flows through the existing Electric/collections sync that
 * every window shares.
 */
export const createPopoutRouter = () =>
	router({
		/** Tear a pane off into its own window (or focus the existing one). */
		openPane: publicProcedure
			.input(popoutPayloadSchema)
			.mutation(async ({ input }) => {
				if (!popoutManager) return { ok: false as const };
				await popoutManager.open(input);
				return {
					ok: true as const,
					popoutId: popoutWindowId(input.workspaceId, input.paneId),
				};
			}),

		/** Close a specific popout window (e.g. when its pane is re-docked). */
		closePane: publicProcedure
			.input(z.object({ workspaceId: z.string(), paneId: z.string() }))
			.mutation(({ input }) => {
				popoutManager?.close(popoutWindowId(input.workspaceId, input.paneId));
				return { ok: true as const };
			}),

		/** Whether a given pane is currently torn off (drives the dock/undock UI). */
		isPoppedOut: publicProcedure
			.input(z.object({ workspaceId: z.string(), paneId: z.string() }))
			.query(({ input }) => {
				return (
					popoutManager?.has(popoutWindowId(input.workspaceId, input.paneId)) ??
					false
				);
			}),
	});

export type PopoutRouter = ReturnType<typeof createPopoutRouter>;
