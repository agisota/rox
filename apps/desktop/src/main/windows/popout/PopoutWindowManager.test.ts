import { describe, expect, it, mock } from "bun:test";
import type { BrowserWindow } from "electron";
import { type PopoutWindowPayload, popoutWindowId } from "shared/types/popout";
import { PopoutWindowManager } from "./PopoutWindowManager";

/** Minimal BrowserWindow stub recording the calls the manager makes. */
function makeFakeWindow() {
	const handlers = new Map<string, () => void>();
	const win = {
		destroyed: false,
		shown: 0,
		focused: 0,
		isDestroyed: () => win.destroyed,
		show: () => {
			win.shown += 1;
		},
		focus: () => {
			win.focused += 1;
		},
		close: () => {
			win.destroyed = true;
			handlers.get("closed")?.();
		},
		destroy: () => {
			win.destroyed = true;
		},
		once: (event: string, cb: () => void) => {
			handlers.set(event, cb);
		},
		on: (event: string, cb: () => void) => {
			handlers.set(event, cb);
		},
		emit: (event: string) => handlers.get(event)?.(),
	};
	return win as unknown as BrowserWindow & {
		shown: number;
		focused: number;
		emit: (event: string) => void;
		destroyed: boolean;
	};
}

const payload: PopoutWindowPayload = {
	workspaceId: "ws1",
	paneId: "pane1",
	kind: "chat",
	paneLayoutJson: "{}",
};

function makeManager() {
	const created: ReturnType<typeof makeFakeWindow>[] = [];
	const attached: BrowserWindow[] = [];
	const detached: BrowserWindow[] = [];
	const mgr = new PopoutWindowManager({
		createWindow: () => {
			const w = makeFakeWindow();
			created.push(w);
			return w;
		},
		loadPopout: mock(async () => {}),
		attachIpc: (w) => attached.push(w),
		detachIpc: (w) => detached.push(w),
		saveBounds: mock(() => {}),
	});
	return { mgr, created, attached, detached };
}

describe("PopoutWindowManager", () => {
	it("opens a popout, attaches IPC, and shows it on ready-to-show", async () => {
		const { mgr, created, attached } = makeManager();
		await mgr.open(payload);

		expect(created).toHaveLength(1);
		expect(attached).toHaveLength(1);
		expect(mgr.size).toBe(1);
		expect(mgr.has(popoutWindowId("ws1", "pane1"))).toBe(true);

		created[0].emit("ready-to-show");
		expect(created[0].shown).toBe(1);
	});

	it("focuses the existing window instead of duplicating on re-tear", async () => {
		const { mgr, created } = makeManager();
		await mgr.open(payload);
		await mgr.open(payload);

		expect(created).toHaveLength(1); // not duplicated
		expect(mgr.size).toBe(1);
		expect(created[0].focused).toBe(1);
	});

	it("removes the entry and detaches IPC when a popout closes", async () => {
		const { mgr, created, detached } = makeManager();
		await mgr.open(payload);
		created[0].close();

		expect(detached).toHaveLength(1);
		expect(mgr.size).toBe(0);
		expect(mgr.has(popoutWindowId("ws1", "pane1"))).toBe(false);
	});

	it("destroyAll destroys every open popout", async () => {
		const { mgr, created } = makeManager();
		await mgr.open(payload);
		await mgr.open({ ...payload, paneId: "pane2" });
		expect(mgr.size).toBe(2);

		mgr.destroyAll();
		expect(mgr.size).toBe(0);
		expect(created.every((w) => w.destroyed)).toBe(true);
	});
});
