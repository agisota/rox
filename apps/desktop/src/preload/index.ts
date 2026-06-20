import { logger } from "shared/logger";
import "@sentry/electron/preload";

import { contextBridge, ipcRenderer, webUtils } from "electron";
import { exposeElectronTRPC } from "trpc-electron/main";
import type {
	IpcEventChannel,
	IpcEventChannels,
	IpcEventListener,
} from "./ipc-channels";

declare const __APP_VERSION__: string;

declare global {
	interface Window {
		App: typeof API;
		ipcRenderer: typeof ipcRendererAPI;
		webUtils: {
			getPathForFile: (file: File) => string;
		};
	}
}

const API = {
	sayHelloFromBridge: () => logger.info("\nHello from bridgeAPI! 👋\n\n"),
	username: process.env.USER,
	appVersion: __APP_VERSION__,
};

// Store mapping of user listeners to wrapped listeners for proper cleanup
type WrappedIpcListener = (
	event: Electron.IpcRendererEvent,
	...args: unknown[]
) => void;
const listenerMap = new WeakMap<
	IpcEventListener<IpcEventChannel>,
	WrappedIpcListener
>();

/**
 * IPC renderer API
 * Note: Primary IPC communication uses tRPC. This API is for low-level IPC needs.
 *
 * `on`/`off`/`send` are typed over the enumerable {@link IpcEventChannels} map so
 * call sites get checked channel names and payloads. `invoke` stays generic
 * (`channel: string`) because its sole consumer is a third-party persistence
 * adapter whose callback contract is `(channel: string, request) => Promise<...>`
 * with a runtime-chosen channel name.
 */
const ipcRendererAPI = {
	// biome-ignore lint/suspicious/noExplicitAny: generic escape hatch — channel is a runtime value supplied by third-party persistence adapters, not a literal
	invoke: (channel: string, ...args: any[]): Promise<any> =>
		ipcRenderer.invoke(channel, ...args),

	send: <K extends IpcEventChannel>(
		channel: K,
		...args: IpcEventChannels[K]
	): void => ipcRenderer.send(channel, ...args),

	on: <K extends IpcEventChannel>(
		channel: K,
		listener: IpcEventListener<K>,
	): void => {
		const wrappedListener: WrappedIpcListener = (_event, ...args) => {
			listener(...(args as IpcEventChannels[K]));
		};
		listenerMap.set(
			listener as IpcEventListener<IpcEventChannel>,
			wrappedListener,
		);
		ipcRenderer.on(channel, wrappedListener);
	},

	off: <K extends IpcEventChannel>(
		channel: K,
		listener: IpcEventListener<K>,
	): void => {
		const wrappedListener = listenerMap.get(
			listener as IpcEventListener<IpcEventChannel>,
		);
		if (wrappedListener) {
			ipcRenderer.removeListener(channel, wrappedListener);
			listenerMap.delete(listener as IpcEventListener<IpcEventChannel>);
		}
	},
};

// Expose electron-trpc IPC channel FIRST (must be before contextBridge calls)
exposeElectronTRPC();

contextBridge.exposeInMainWorld("App", API);
contextBridge.exposeInMainWorld("ipcRenderer", ipcRendererAPI);
contextBridge.exposeInMainWorld("webUtils", {
	getPathForFile: (file: File) => webUtils.getPathForFile(file),
});
