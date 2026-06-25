import { describe, expect, it } from "bun:test";
import type { EntryRef } from "../types";
import {
	type DriveDropTarget,
	dragId,
	dragRefs,
	dropTargetId,
	isDropAllowed,
} from "./dnd";

const folder = (id: string): EntryRef => ({ kind: "folder", id });
const file = (id: string): EntryRef => ({ kind: "file", id });

describe("dropTargetId / dragId", () => {
	it("encodes root and folder targets distinctly", () => {
		expect(dropTargetId({ kind: "root" })).toBe("drop:root");
		expect(dropTargetId({ kind: "folder", id: "f1" })).toBe("drop:folder:f1");
	});

	it("encodes draggable ids by ref kind + id", () => {
		expect(dragId(folder("f1"))).toBe("drag:folder:f1");
		expect(dragId(file("x1"))).toBe("drag:file:x1");
	});
});

describe("isDropAllowed", () => {
	const intoF2: DriveDropTarget = { kind: "folder", id: "f2" };

	it("rejects an empty drag set", () => {
		expect(isDropAllowed([], intoF2, null)).toBe(false);
	});

	it("rejects dropping into the folder you are already in", () => {
		// currentFolder = f2, target = f2 → no-op.
		expect(isDropAllowed([file("x1")], intoF2, "f2")).toBe(false);
		// root → root.
		expect(isDropAllowed([file("x1")], { kind: "root" }, null)).toBe(false);
	});

	it("rejects dropping a folder onto itself", () => {
		expect(
			isDropAllowed([folder("f2")], { kind: "folder", id: "f2" }, null),
		).toBe(false);
	});

	it("rejects when the dragged set contains the target folder (multi-select)", () => {
		expect(
			isDropAllowed(
				[file("x1"), folder("f2")],
				{ kind: "folder", id: "f2" },
				null,
			),
		).toBe(false);
	});

	it("allows a file into another folder", () => {
		expect(isDropAllowed([file("x1")], intoF2, "root-or-null")).toBe(true);
		expect(isDropAllowed([file("x1")], intoF2, null)).toBe(true);
	});

	it("allows a folder into a different folder", () => {
		expect(isDropAllowed([folder("f1")], intoF2, null)).toBe(true);
	});

	it("allows moving to root via the breadcrumb when not already at root", () => {
		expect(isDropAllowed([file("x1")], { kind: "root" }, "f5")).toBe(true);
	});
});

describe("dragRefs", () => {
	const all = [folder("f1"), file("x1"), file("x2")];

	it("returns just the grabbed ref when it is not in the selection", () => {
		const selected = new Set(["file:x2"]);
		expect(dragRefs(folder("f1"), selected, all)).toEqual([folder("f1")]);
	});

	it("expands to the whole selection when the grabbed ref is selected", () => {
		const selected = new Set(["folder:f1", "file:x1"]);
		const result = dragRefs(folder("f1"), selected, all);
		expect(result).toEqual([folder("f1"), file("x1")]);
	});

	it("falls back to the grabbed ref when selection resolves empty", () => {
		const selected = new Set(["folder:f1"]);
		// allRefs does not contain f1 → inSelection empty → fallback.
		expect(dragRefs(folder("f1"), selected, [file("x1")])).toEqual([
			folder("f1"),
		]);
	});
});
