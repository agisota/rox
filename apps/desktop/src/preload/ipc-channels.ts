/**
 * Typed map of the low-level IPC event channels exposed through the preload
 * bridge (`window.ipcRenderer`).
 *
 * Primary IPC communication uses tRPC (electron-trpc); this bridge only carries
 * a small, enumerable set of one-way main -> renderer event channels plus a
 * generic `invoke` escape hatch used by third-party persistence adapters.
 *
 * Each key is a channel name; the tuple value is the payload args that the main
 * process pushes via `webContents.send(channel, ...args)` and that listeners
 * registered through `ipcRenderer.on` receive.
 */
export interface IpcEventChannels {
	/**
	 * Deep-link navigation pushed from the main process (custom protocol /
	 * second-instance handling) to the renderer router.
	 * Sent in `src/main/index.ts` via `webContents.send("deep-link-navigate", path)`.
	 */
	"deep-link-navigate": [path: string];
}

/** Union of all event channel names known to the bridge. */
export type IpcEventChannel = keyof IpcEventChannels;

/** Listener signature for a given event channel. */
export type IpcEventListener<K extends IpcEventChannel> = (
	...args: IpcEventChannels[K]
) => void;
