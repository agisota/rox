import type { BrowserWindow } from "electron";
import { savePopoutWindowState } from "main/lib/window-state";
import { type PopoutWindowPayload, popoutWindowId } from "shared/types/popout";

export interface PopoutWindowManagerDeps {
	/** Constructs a hidden popout BrowserWindow for the payload (injected for tests). */
	createWindow: (payload: PopoutWindowPayload) => BrowserWindow;
	/** Loads the `/popout` route (dev URL vs prod file + hash) into the window. */
	loadPopout: (
		win: BrowserWindow,
		payload: PopoutWindowPayload,
	) => Promise<void>;
	/**
	 * Attach the popout to the singleton trpc-electron IPC handler so its renderer
	 * can call the same router as the main window (single core-state).
	 */
	attachIpc: (win: BrowserWindow) => void;
	/** Detach on close to avoid leaking handlers. */
	detachIpc: (win: BrowserWindow) => void;
	/** Persist this popout's bounds (keyed by popout id). Injected for tests. */
	saveBounds?: (popoutId: string, win: BrowserWindow) => void;
}

interface Entry {
	win: BrowserWindow;
	payload: PopoutWindowPayload;
}

/**
 * Owns the lifecycle of all tear-off popout windows (F52), keyed by popout id
 * (`workspace:pane`). Generalizes the single-window {@link SpectreWindowManager}
 * into an id-keyed registry:
 *
 * - Re-tearing the same pane focuses the existing window instead of duplicating.
 * - Each window's bounds are persisted independently (move/resize + close), so
 *   closing one popout never corrupts another's — or the main window's — state.
 * - Each popout is attached to the shared trpc IPC handler so it is a live view
 *   onto the one core-state, not a forked copy.
 */
export class PopoutWindowManager {
	private readonly entries = new Map<string, Entry>();

	constructor(private readonly deps: PopoutWindowManagerDeps) {}

	/** Number of currently open popouts (test/diagnostic helper). */
	get size(): number {
		return this.entries.size;
	}

	has(popoutId: string): boolean {
		const entry = this.entries.get(popoutId);
		return !!entry && !entry.win.isDestroyed();
	}

	/**
	 * Open (or focus) the popout for a pane. Idempotent per popout id: a second
	 * tear-off of the same pane re-focuses the live window and re-broadcasts the
	 * latest payload (so its layout snapshot refreshes) rather than spawning a
	 * duplicate.
	 */
	async open(payload: PopoutWindowPayload): Promise<BrowserWindow> {
		const id = popoutWindowId(payload.workspaceId, payload.paneId);
		const existing = this.entries.get(id);
		if (existing && !existing.win.isDestroyed()) {
			existing.payload = payload;
			existing.win.show();
			existing.win.focus();
			return existing.win;
		}

		const win = this.deps.createWindow(payload);
		this.entries.set(id, { win, payload });
		this.deps.attachIpc(win);
		this.bindBoundsPersistence(id, win);

		win.once("ready-to-show", () => {
			if (!win.isDestroyed()) win.show();
		});
		win.on("closed", () => {
			this.deps.detachIpc(win);
			this.entries.delete(id);
		});

		await this.deps.loadPopout(win, payload);
		return win;
	}

	/** Close a specific popout window. No-op if it isn't open. */
	close(popoutId: string): void {
		const entry = this.entries.get(popoutId);
		if (entry && !entry.win.isDestroyed()) entry.win.close();
	}

	/** Destroy every popout window (used on app quit). */
	destroyAll(): void {
		for (const { win } of this.entries.values()) {
			if (!win.isDestroyed()) win.destroy();
		}
		this.entries.clear();
	}

	/**
	 * Persist bounds on move/resize (debounced) and on close, so geometry survives
	 * `app.exit(0)` which skips the close handler. Independent per popout id.
	 */
	private bindBoundsPersistence(id: string, win: BrowserWindow): void {
		const save = this.deps.saveBounds ?? defaultSaveBounds;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const debounced = () => {
			if (win.isDestroyed()) return;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				if (!win.isDestroyed()) save(id, win);
			}, 500);
		};
		win.on("move", debounced);
		win.on("resize", debounced);
		win.on("close", () => {
			if (timer) clearTimeout(timer);
			if (!win.isDestroyed()) save(id, win);
		});
	}
}

/** Capture and persist a popout window's current bounds under its popout id. */
function defaultSaveBounds(popoutId: string, win: BrowserWindow): void {
	const isMaximized = win.isMaximized();
	const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
	savePopoutWindowState(popoutId, {
		x: bounds.x,
		y: bounds.y,
		width: bounds.width,
		height: bounds.height,
		isMaximized,
	});
}
