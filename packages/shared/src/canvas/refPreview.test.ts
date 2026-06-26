import { describe, expect, it } from "bun:test";
import {
	isImageRefPath,
	noteMarkdownExcerpt,
	type RefNodeLiveData,
	taskStatusTone,
	toRefNodePreview,
} from "./refPreview";
import type { CanvasNode } from "./schema";

function node(partial: Partial<CanvasNode>): CanvasNode {
	return {
		id: "n1",
		type: "text",
		position: { x: 0, y: 0 },
		tags: [],
		locked: false,
		collapsed: false,
		...partial,
	} as CanvasNode;
}

describe("taskStatusTone", () => {
	it("maps known statuses to lifecycle tones", () => {
		expect(taskStatusTone("todo")).toBe("todo");
		expect(taskStatusTone("In_Progress")).toBe("in-progress");
		expect(taskStatusTone("DONE")).toBe("done");
		expect(taskStatusTone("blocked")).toBe("blocked");
		expect(taskStatusTone("canceled")).toBe("cancelled");
	});

	it("falls back to unknown for unrecognised/empty status", () => {
		expect(taskStatusTone(undefined)).toBe("unknown");
		expect(taskStatusTone("")).toBe("unknown");
		expect(taskStatusTone("weird")).toBe("unknown");
	});
});

describe("isImageRefPath", () => {
	it("detects image extensions ignoring query/hash", () => {
		expect(isImageRefPath("assets/logo.png")).toBe(true);
		expect(isImageRefPath("a.JPEG")).toBe(true);
		expect(isImageRefPath("img.webp?v=2")).toBe(true);
		expect(isImageRefPath("notes/readme.md")).toBe(false);
		expect(isImageRefPath(undefined)).toBe(false);
		expect(isImageRefPath("noext")).toBe(false);
	});
});

describe("noteMarkdownExcerpt", () => {
	it("keeps the first N non-empty lines and caps length", () => {
		const md = "# Title\n\n- a\n- b\n- c\n- d\n- e\n- f\n- g";
		const out = noteMarkdownExcerpt(md, 4);
		expect(out.startsWith("# Title")).toBe(true);
		expect(out).not.toContain("- g");
	});

	it("returns empty string for empty input", () => {
		expect(noteMarkdownExcerpt(undefined)).toBe("");
		expect(noteMarkdownExcerpt("")).toBe("");
	});
});

describe("toRefNodePreview", () => {
	it("returns generic for nodes without a ref", () => {
		const preview = toRefNodePreview(node({ text: "plain" }));
		expect(preview).toEqual({ kind: "generic", text: "plain" });
	});

	it("builds a chat preview with live replies, falling back to cached title", () => {
		const n = node({
			type: "chat-session",
			ref: { type: "session", id: "s1", preview: "Cached session" },
		});
		const live: RefNodeLiveData = {
			title: "Live session",
			status: "active",
			replies: [
				{ role: "USER", text: "  hello   world  " },
				{ role: "assistant", text: "hi" },
			],
		};
		const preview = toRefNodePreview(n, live);
		expect(preview).toMatchObject({
			kind: "chat",
			title: "Live session",
			status: "active",
		});
		if (preview.kind !== "chat") throw new Error("expected chat");
		expect(preview.replies[0]).toEqual({ role: "user", text: "hello world" });

		// Cache-first: no live data still yields the cached title.
		const cached = toRefNodePreview(n);
		expect(cached).toMatchObject({ kind: "chat", title: "Cached session" });
	});

	it("builds a note preview from live markdown or cached text", () => {
		const n = node({
			type: "note",
			title: "Note title",
			text: "# fallback\nbody",
			ref: { type: "note", id: "note1", path: "n.md" },
		});
		const live = toRefNodePreview(n, { markdown: "# live\ncontent" });
		expect(live).toMatchObject({ kind: "note", title: "Note title" });
		if (live.kind !== "note") throw new Error("expected note");
		expect(live.markdown).toContain("# live");

		const cached = toRefNodePreview(n);
		if (cached.kind !== "note") throw new Error("expected note");
		expect(cached.markdown).toContain("# fallback");
	});

	it("builds a task preview with a tone from the status", () => {
		const n = node({
			type: "task",
			title: "Ship it",
			ref: { type: "task", id: "t1", version: "in-progress" },
		});
		const preview = toRefNodePreview(n);
		expect(preview).toMatchObject({
			kind: "task",
			title: "Ship it",
			tone: "in-progress",
			statusLabel: "in-progress",
		});

		const live = toRefNodePreview(n, { status: "done" });
		expect(live).toMatchObject({ kind: "task", tone: "done" });
	});

	it("routes image-extension file refs to the image preview", () => {
		const n = node({
			type: "image",
			ref: { type: "file", id: "f1", path: "media/shot.png" },
		});
		const preview = toRefNodePreview(n, { imageSrc: "blob:abc" });
		expect(preview).toMatchObject({
			kind: "image",
			name: "shot.png",
			src: "blob:abc",
		});
	});

	it("builds a file preview with name + git status for non-image files", () => {
		const n = node({
			type: "file",
			ref: { type: "file", id: "f2", path: "src/app.ts" },
		});
		const preview = toRefNodePreview(n, { gitStatus: "modified" });
		expect(preview).toEqual({
			kind: "file",
			name: "app.ts",
			path: "src/app.ts",
			gitStatus: "modified",
		});
	});
});
