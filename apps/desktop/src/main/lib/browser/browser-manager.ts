import { EventEmitter } from "node:events";
import { clipboard, Menu, webContents } from "electron";
import { safeOpenExternal } from "main/lib/safe-url";
import type { DevicePreset } from "shared/browser/types";

interface ConsoleEntry {
	level: "log" | "warn" | "error" | "info" | "debug";
	message: string;
	timestamp: number;
}

const MAX_CONSOLE_ENTRIES = 500;

function sanitizeUrl(url: string): string {
	if (/^https?:\/\//i.test(url) || url.startsWith("about:")) {
		return url;
	}
	if (url.startsWith("localhost") || url.startsWith("127.0.0.1")) {
		return `http://${url}`;
	}
	if (url.includes(".")) {
		return `https://${url}`;
	}
	return `https://www.google.com/search?q=${encodeURIComponent(url)}`;
}

class BrowserManager extends EventEmitter {
	private paneWebContentsIds = new Map<string, number>();
	private consoleLogs = new Map<string, ConsoleEntry[]>();
	private consoleListeners = new Map<string, () => void>();
	private contextMenuListeners = new Map<string, () => void>();
	private beforeInputListeners = new Map<string, () => void>();
	private originalUserAgents = new Map<string, string>();

	register(paneId: string, webContentsId: number): void {
		// Clean even when prevId === webContentsId so BrowserManager owns
		// listener idempotency; callers can re-register without duplicating.
		const prevId = this.paneWebContentsIds.get(paneId);
		if (prevId != null) {
			for (const map of [
				this.consoleListeners,
				this.contextMenuListeners,
				this.beforeInputListeners,
			]) {
				const cleanup = map.get(paneId);
				if (cleanup) {
					cleanup();
					map.delete(paneId);
				}
			}
		}
		this.paneWebContentsIds.set(paneId, webContentsId);
		const wc = webContents.fromId(webContentsId);
		if (wc) {
			// Keep throttling enabled so parked/offscreen persistent webviews don't
			// run at full speed in the background.
			wc.setBackgroundThrottling(true);
			wc.setWindowOpenHandler(({ url }) => {
				if (url && url !== "about:blank") {
					this.emit(`new-window:${paneId}`, url);
				}
				return { action: "deny" as const };
			});
			this.setupConsoleCapture(paneId, wc);
			this.setupContextMenu(paneId, wc);
			this.setupBeforeInput(paneId, wc);
		}
	}

	unregister(paneId: string): void {
		for (const map of [
			this.consoleListeners,
			this.contextMenuListeners,
			this.beforeInputListeners,
		]) {
			const cleanup = map.get(paneId);
			if (cleanup) {
				cleanup();
				map.delete(paneId);
			}
		}
		this.paneWebContentsIds.delete(paneId);
		this.consoleLogs.delete(paneId);
		this.originalUserAgents.delete(paneId);
	}

	unregisterAll(): void {
		for (const paneId of [...this.paneWebContentsIds.keys()]) {
			this.unregister(paneId);
		}
	}

	getWebContents(paneId: string): Electron.WebContents | null {
		const id = this.paneWebContentsIds.get(paneId);
		if (id == null) return null;
		const wc = webContents.fromId(id);
		if (!wc || wc.isDestroyed()) return null;
		return wc;
	}

	navigate(paneId: string, url: string): void {
		const wc = this.getWebContents(paneId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		wc.loadURL(sanitizeUrl(url));
	}

	async screenshot(paneId: string): Promise<string> {
		const wc = this.getWebContents(paneId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		const image = await wc.capturePage();
		clipboard.writeImage(image);
		return image.toPNG().toString("base64");
	}

	async evaluateJS(paneId: string, code: string): Promise<unknown> {
		const wc = this.getWebContents(paneId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		return wc.executeJavaScript(code);
	}

	/**
	 * Captures a CSS-pixel region of the guest page as a PNG. Used for Design
	 * Mode cropped screenshots. The returned image is at the page's device scale.
	 */
	async captureRegion(
		paneId: string,
		rect: { x: number; y: number; width: number; height: number },
	): Promise<{ data: string; width: number; height: number }> {
		const wc = this.getWebContents(paneId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		const image = await wc.capturePage({
			x: Math.round(rect.x),
			y: Math.round(rect.y),
			width: Math.max(1, Math.round(rect.width)),
			height: Math.max(1, Math.round(rect.height)),
		});
		const size = image.getSize();
		return {
			data: image.toPNG().toString("base64"),
			width: size.width,
			height: size.height,
		};
	}

	/**
	 * Applies (or clears) device emulation for a pane. The `responsive` preset
	 * disables emulation and restores the original user agent; mobile presets set
	 * viewport size, device scale factor, user agent, and best-effort touch.
	 */
	setDevicePreset(paneId: string, preset: DevicePreset): void {
		const wc = this.getWebContents(paneId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);

		const emulated =
			preset.id !== "responsive" && preset.width > 0 && preset.height > 0;

		if (!emulated) {
			wc.disableDeviceEmulation();
			const original = this.originalUserAgents.get(paneId);
			if (original != null) wc.setUserAgent(original);
			this.setTouchEmulation(wc, false);
			return;
		}

		if (!this.originalUserAgents.has(paneId)) {
			this.originalUserAgents.set(paneId, wc.getUserAgent());
		}
		wc.enableDeviceEmulation({
			screenPosition: preset.isMobile ? "mobile" : "desktop",
			screenSize: { width: preset.width, height: preset.height },
			viewSize: { width: preset.width, height: preset.height },
			viewPosition: { x: 0, y: 0 },
			deviceScaleFactor: preset.deviceScaleFactor,
			scale: 1,
		});
		// Reset to the original UA when an emulated preset omits one, so a mobile
		// UA from a previous preset doesn't linger under a different viewport.
		const original = this.originalUserAgents.get(paneId);
		if (preset.userAgent) wc.setUserAgent(preset.userAgent);
		else if (original != null) wc.setUserAgent(original);
		this.setTouchEmulation(wc, preset.hasTouch);
	}

	// Touch emulation has no first-class WebContents API; drive it via CDP and
	// swallow failures so an unsupported environment never crashes capture.
	private setTouchEmulation(wc: Electron.WebContents, enabled: boolean): void {
		try {
			// Don't attach the debugger just to disable touch on a fresh pane.
			if (!enabled && !wc.debugger.isAttached()) return;
			if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
			void Promise.all([
				wc.debugger.sendCommand("Emulation.setTouchEmulationEnabled", {
					enabled,
					maxTouchPoints: enabled ? 5 : 0,
				}),
				wc.debugger.sendCommand("Emulation.setEmitTouchEventsForMouse", {
					enabled,
					configuration: "mobile",
				}),
			]).catch(() => {
				// Async CDP rejection (target gone / protocol error) — non-fatal.
			});
		} catch {
			// CDP unavailable (e.g. devtools already attached) — non-fatal.
		}
	}

	getConsoleLogs(paneId: string): ConsoleEntry[] {
		return this.consoleLogs.get(paneId) ?? [];
	}

	openDevTools(paneId: string): void {
		const wc = this.getWebContents(paneId);
		if (!wc) return;
		wc.openDevTools({ mode: "detach" });
	}

	private setupContextMenu(paneId: string, wc: Electron.WebContents): void {
		const handler = (
			_event: Electron.Event,
			params: Electron.ContextMenuParams,
		) => {
			const { linkURL, pageURL, selectionText, editFlags } = params;

			const menuItems: Electron.MenuItemConstructorOptions[] = [];

			if (linkURL) {
				menuItems.push(
					{
						label: "Open Link in Default Browser",
						click: () => {
							void safeOpenExternal(linkURL);
						},
					},
					{
						label: "Open Link as New Split",
						click: () =>
							this.emit(`context-menu-action:${paneId}`, {
								action: "open-in-split" as const,
								url: linkURL,
							}),
					},
					{
						label: "Copy Link Address",
						click: () => clipboard.writeText(linkURL),
					},
					{ type: "separator" },
				);
			}

			if (selectionText) {
				menuItems.push({
					label: "Copy",
					enabled: editFlags.canCopy,
					click: () => wc.copy(),
				});
			}

			if (editFlags.canPaste) {
				menuItems.push({
					label: "Paste",
					click: () => wc.paste(),
				});
			}

			if (editFlags.canSelectAll) {
				menuItems.push({
					label: "Select All",
					click: () => wc.selectAll(),
				});
			}

			if (selectionText || editFlags.canPaste || editFlags.canSelectAll) {
				menuItems.push({ type: "separator" });
			}

			menuItems.push(
				{
					label: "Back",
					enabled: wc.canGoBack(),
					click: () => wc.goBack(),
				},
				{
					label: "Forward",
					enabled: wc.canGoForward(),
					click: () => wc.goForward(),
				},
				{
					label: "Reload",
					click: () => wc.reload(),
				},
			);

			if (!linkURL) {
				menuItems.push(
					{ type: "separator" },
					{
						label: "Open Page in Default Browser",
						click: () => {
							if (pageURL && pageURL !== "about:blank") {
								void safeOpenExternal(pageURL);
							}
						},
						enabled: !!pageURL && pageURL !== "about:blank",
					},
					{
						label: "Copy Page URL",
						click: () => {
							if (pageURL) clipboard.writeText(pageURL);
						},
						enabled: !!pageURL && pageURL !== "about:blank",
					},
				);
			}

			const menu = Menu.buildFromTemplate(menuItems);
			menu.popup();
		};

		wc.on("context-menu", handler);
		this.contextMenuListeners.set(paneId, () => {
			try {
				wc.off("context-menu", handler);
			} catch {
				// webContents may be destroyed
			}
		});
	}

	// When a webview has focus, keystrokes route to the guest renderer — host
	// `react-hotkeys-hook` listeners never see them and the menu's CmdOrCtrl+W
	// accelerator closes the whole window. `before-input-event` fires in the
	// main process before both, and `preventDefault()` suppresses both.
	//
	// keyDown guard prevents a second fire on keyUp. Shift guard preserves
	// Cmd+Shift+W (CLOSE_TAB) and Cmd+Shift+R (forceReload).
	private setupBeforeInput(paneId: string, wc: Electron.WebContents): void {
		const handler = (event: Electron.Event, input: Electron.Input): void => {
			if (input.type !== "keyDown") return;
			if (input.shift || input.alt) return;
			if (!(input.meta || input.control)) return;

			const key = input.key.toLowerCase();
			if (key === "w") {
				event.preventDefault();
				this.emit(`close-pane:${paneId}`);
				return;
			}
			if (key === "r") {
				event.preventDefault();
				this.emit(`reload-pane:${paneId}`);
				return;
			}
		};

		wc.on("before-input-event", handler);
		this.beforeInputListeners.set(paneId, () => {
			try {
				wc.off("before-input-event", handler);
			} catch {
				// webContents may be destroyed
			}
		});
	}

	private setupConsoleCapture(paneId: string, wc: Electron.WebContents): void {
		const LEVEL_MAP: Record<number, ConsoleEntry["level"]> = {
			0: "log",
			1: "warn",
			2: "error",
			3: "info",
		};

		const handler = (
			_event: Electron.Event,
			level: number,
			message: string,
		) => {
			const entries = this.consoleLogs.get(paneId) ?? [];
			entries.push({
				level: LEVEL_MAP[level] ?? "log",
				message,
				timestamp: Date.now(),
			});
			if (entries.length > MAX_CONSOLE_ENTRIES) {
				entries.splice(0, entries.length - MAX_CONSOLE_ENTRIES);
			}
			this.consoleLogs.set(paneId, entries);
			this.emit(`console:${paneId}`, entries[entries.length - 1]);
		};

		wc.on("console-message", handler);
		this.consoleListeners.set(paneId, () => {
			try {
				wc.off("console-message", handler);
			} catch {
				// webContents may be destroyed
			}
		});
	}
}

export const browserManager = new BrowserManager();
