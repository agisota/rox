import { observable } from "@trpc/server/observable";
import {
	getPushToTalkAccelerator,
	onPushToTalkPress,
	setPushToTalkAccelerator,
	setPushToTalkRoomConnected,
} from "main/lib/push-to-talk";
import { z } from "zod";
import { publicProcedure, router } from "..";

/**
 * IPC seam for the desktop push-to-talk global shortcut
 * (`live.pushToTalkDesktop`). The main process owns the OS-level
 * `globalShortcut`; the renderer:
 *  - reports voice-room connect/disconnect (`setRoomConnected`) so the shortcut
 *    is only registered while a room is live,
 *  - subscribes to `presses` and toggles the room mic on each press, and
 *  - reads/writes the configurable accelerator for the Settings surface.
 *
 * `presses` is an observable (not an async generator) because trpc-electron
 * only supports observables for IPC subscriptions (see keyboardLayout router).
 */
export const createPushToTalkRouter = () => {
	return router({
		getAccelerator: publicProcedure.query((): { accelerator: string } => {
			return { accelerator: getPushToTalkAccelerator() };
		}),
		setAccelerator: publicProcedure
			.input(z.object({ accelerator: z.string().min(1) }))
			.mutation(({ input }) => {
				setPushToTalkAccelerator(input.accelerator);
				return { accelerator: getPushToTalkAccelerator() };
			}),
		setRoomConnected: publicProcedure
			.input(z.object({ connected: z.boolean() }))
			.mutation(({ input }) => {
				setPushToTalkRoomConnected(input.connected);
				return { success: true };
			}),
		presses: publicProcedure.subscription(() => {
			return observable<{ at: number }>((emit) => {
				return onPushToTalkPress(() => emit.next({ at: Date.now() }));
			});
		}),
	});
};
