import { describe, expect, it } from "bun:test";
import { resolveSyncStatus } from "./syncStatus";

describe("resolveSyncStatus (#537)", () => {
	it("hides the indicator once synced", () => {
		const view = resolveSyncStatus({ syncState: "synced", online: true });
		expect(view.visible).toBe(false);
		expect(view.kind).toBe("synced");
		expect(view.label).toBe("");
		expect(view.tone).toBe("hidden");
	});

	it("hides synced even while offline (nothing to nag about)", () => {
		const view = resolveSyncStatus({ syncState: "synced", online: false });
		expect(view.visible).toBe(false);
	});

	it("shows 'syncing…' for a pending entity while online", () => {
		const view = resolveSyncStatus({ syncState: "pending", online: true });
		expect(view).toEqual({
			visible: true,
			kind: "syncing",
			label: "Синхронизация…",
			tone: "muted",
		});
	});

	it("shows a non-alarming offline hint for pending while offline", () => {
		const view = resolveSyncStatus({ syncState: "pending", online: false });
		expect(view.visible).toBe(true);
		expect(view.kind).toBe("offline");
		expect(view.label).toBe("Офлайн — синхронизируется при подключении");
		expect(view.tone).toBe("warning");
	});

	it("shows a non-alarming 'retrying' for error while online", () => {
		const view = resolveSyncStatus({ syncState: "error", online: true });
		expect(view.visible).toBe(true);
		expect(view.kind).toBe("retrying");
		expect(view.label).toBe("Повтор синхронизации");
		// Never a scary "failed".
		expect(view.label.toLowerCase()).not.toContain("ошибк");
		expect(view.tone).toBe("warning");
	});

	it("treats error-while-offline as the offline hint (connectivity dominates)", () => {
		const view = resolveSyncStatus({ syncState: "error", online: false });
		expect(view.kind).toBe("offline");
		expect(view.label).toBe("Офлайн — синхронизируется при подключении");
	});

	it("defaults to online copy when no online signal is supplied", () => {
		const view = resolveSyncStatus({ syncState: "pending" });
		expect(view.kind).toBe("syncing");
	});
});
