import type { BrowserWindow } from "electron";

export interface SpectreWindowManagerDeps {
	/** Constructs the BrowserWindow (injected for tests). */
	createWindow: () => BrowserWindow;
	isMac: boolean;
	/** Loads the /spectre route into the window (dev URL vs prod file + hash). */
	loadSpectre: (win: BrowserWindow) => Promise<void>;
}

/**
 * Owns the single Spectre overlay BrowserWindow lifecycle and applies the
 * stealth + float invariants that can only be set at runtime (not via the
 * constructor options): content protection (hide from screen-share), an
 * above-fullscreen always-on-top level, and visibility across all Spaces.
 */
export class SpectreWindowManager {
	private win: BrowserWindow | null = null;
	private stealth = true;

	constructor(private readonly deps: SpectreWindowManagerDeps) {}

	async ensureCreated(): Promise<BrowserWindow> {
		if (this.win && !this.win.isDestroyed()) return this.win;
		const win = this.deps.createWindow();
		this.win = win;

		// Runtime-only stealth/float invariants:
		win.setContentProtection(this.stealth); // hide from screen-share/recording
		win.setAlwaysOnTop(true, "screen-saver"); // above normal + fullscreen layers
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

		win.on("closed", () => {
			this.win = null;
		});

		await this.deps.loadSpectre(win);
		return win;
	}

	async show(): Promise<void> {
		const win = await this.ensureCreated();
		win.show();
		win.focus();
		win.webContents.send("spectre:summoned");
	}

	hide(): void {
		if (this.win && !this.win.isDestroyed()) this.win.hide();
	}

	async toggle(): Promise<void> {
		if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
			this.hide();
			return;
		}
		await this.show();
	}

	/** Toggle stealth (content protection) live; persisted preference lives in settings. */
	setStealth(on: boolean): void {
		this.stealth = on;
		if (this.win && !this.win.isDestroyed()) this.win.setContentProtection(on);
	}

	destroy(): void {
		if (this.win && !this.win.isDestroyed()) this.win.destroy();
		this.win = null;
	}
}
