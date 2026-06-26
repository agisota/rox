import type { CanvasNode, CanvasNodeRef } from "./schema";

/**
 * Headless, platform-agnostic model for the *live mini-content* shown inside a
 * canvas ref-node (issue #581). The renderer (web / desktop / mobile) maps this
 * union onto platform widgets; the data shaping itself lives here so every
 * surface derives identical previews from the same `CanvasNode` + resolved ref
 * entity. This is a pure read-only layer over `ref` — it never mutates the
 * `CanvasDocument`.
 */

/** Lifecycle tone for a task node's status dot. */
export type TaskStatusTone =
	| "todo"
	| "in-progress"
	| "blocked"
	| "done"
	| "cancelled"
	| "unknown";

/** A single chat reply rendered in a chat-session ref preview. */
export interface ChatReplyPreview {
	/** `user` | `assistant` | `system` | agent role; free text, lowercased. */
	role: string;
	/** Trimmed, length-capped reply text. */
	text: string;
}

export interface ChatRefNodePreview {
	kind: "chat";
	title: string;
	status?: string;
	replies: ChatReplyPreview[];
}

export interface NoteRefNodePreview {
	kind: "note";
	title: string;
	/** First lines of markdown, ready for a read-only markdown renderer. */
	markdown: string;
}

export interface FileRefNodePreview {
	kind: "file";
	name: string;
	path?: string;
	/** Git working-tree status of the file, when known. */
	gitStatus?: GitStatusTone;
}

export interface ImageRefNodePreview {
	kind: "image";
	name: string;
	/** Source usable by an `<img>`/`Image` (presigned URL or local file URL). */
	src?: string;
	path?: string;
}

export interface TaskRefNodePreview {
	kind: "task";
	title: string;
	tone: TaskStatusTone;
	/** Raw status label, when present (e.g. "in-progress"). */
	statusLabel?: string;
}

/** Fallback: the existing static snapshot path for non-ref / unsupported refs. */
export interface GenericRefNodePreview {
	kind: "generic";
	text?: string;
}

export type RefNodePreview =
	| ChatRefNodePreview
	| NoteRefNodePreview
	| FileRefNodePreview
	| ImageRefNodePreview
	| TaskRefNodePreview
	| GenericRefNodePreview;

/** Normalized git working-tree status for a single file. */
export type GitStatusTone =
	| "modified"
	| "added"
	| "deleted"
	| "renamed"
	| "untracked"
	| "clean";

const TASK_STATUS_TONES: Record<string, TaskStatusTone> = {
	todo: "todo",
	open: "todo",
	backlog: "todo",
	pending: "todo",
	"in-progress": "in-progress",
	in_progress: "in-progress",
	inprogress: "in-progress",
	doing: "in-progress",
	active: "in-progress",
	blocked: "blocked",
	waiting: "blocked",
	done: "done",
	complete: "done",
	completed: "done",
	closed: "done",
	cancelled: "cancelled",
	canceled: "cancelled",
};

/** Map a free-text task status to a stable lifecycle tone for the status dot. */
export function taskStatusTone(
	status: string | undefined | null,
): TaskStatusTone {
	if (!status) return "unknown";
	const key = status.trim().toLowerCase();
	return TASK_STATUS_TONES[key] ?? "unknown";
}

const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"avif",
	"bmp",
	"ico",
]);

/** True when a ref path / id points at a renderable image file. */
export function isImageRefPath(value: string | undefined | null): boolean {
	if (!value) return false;
	const clean = value.split(/[?#]/)[0] ?? value;
	const dot = clean.lastIndexOf(".");
	if (dot < 0) return false;
	return IMAGE_EXTENSIONS.has(clean.slice(dot + 1).toLowerCase());
}

/**
 * Take the first N non-empty markdown lines, preserving markdown structure so a
 * read-only renderer can show headings/lists. Caps total length to avoid huge
 * snapshots bleeding into the node.
 */
export function noteMarkdownExcerpt(
	content: string | undefined | null,
	maxLines = 6,
	maxChars = 480,
): string {
	if (!content) return "";
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	const picked: string[] = [];
	for (const line of lines) {
		picked.push(line);
		if (picked.filter((entry) => entry.trim().length > 0).length >= maxLines) {
			break;
		}
	}
	let excerpt = picked.join("\n").trimEnd();
	if (excerpt.length > maxChars) excerpt = `${excerpt.slice(0, maxChars)}…`;
	return excerpt;
}

function basename(value: string): string {
	const parts = value.split(/[\\/]+/).filter(Boolean);
	return parts.at(-1) ?? value;
}

function clampReply(text: string, maxChars = 160): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	return collapsed.length > maxChars
		? `${collapsed.slice(0, maxChars)}…`
		: collapsed;
}

/**
 * Live entity data fetched for a ref node, in a shape the headless mapper can
 * consume regardless of transport. All fields optional so partial/cache-first
 * data still produces a usable preview.
 */
export interface RefNodeLiveData {
	title?: string;
	status?: string;
	markdown?: string;
	/** Newest-last chat replies. */
	replies?: ChatReplyPreview[];
	/** Image source (presigned/local URL). */
	imageSrc?: string;
	/** Git working-tree status for file refs. */
	gitStatus?: GitStatusTone;
}

/**
 * Build the headless preview model for a canvas node. `live` carries any
 * freshly-resolved entity data; when it is absent/partial the function falls
 * back to the node's last-known `ref.preview`/`title` so the renderer can show
 * the cached snapshot immediately (cache-first, no skeleton storm).
 */
export function toRefNodePreview(
	node: Pick<CanvasNode, "type" | "title" | "text"> & {
		ref?: CanvasNodeRef;
	},
	live?: RefNodeLiveData,
): RefNodePreview {
	const ref = node.ref;
	if (!ref) {
		return { kind: "generic", text: node.text };
	}

	const cachedTitle = node.title ?? ref.preview;

	if (ref.type === "session") {
		return {
			kind: "chat",
			title: live?.title ?? cachedTitle ?? "Сессия",
			status: live?.status,
			replies: (live?.replies ?? []).map((reply) => ({
				role: reply.role.toLowerCase(),
				text: clampReply(reply.text),
			})),
		};
	}

	if (ref.type === "note") {
		const source = live?.markdown ?? node.text ?? ref.preview ?? "";
		return {
			kind: "note",
			title: live?.title ?? cachedTitle ?? "Заметка",
			markdown: noteMarkdownExcerpt(source),
		};
	}

	if (ref.type === "task") {
		const statusLabel = live?.status ?? ref.version;
		return {
			kind: "task",
			title: live?.title ?? cachedTitle ?? "Задача",
			tone: taskStatusTone(statusLabel),
			statusLabel: statusLabel ?? undefined,
		};
	}

	if (ref.type === "file") {
		const path = ref.path ?? undefined;
		const name = basename(path ?? cachedTitle ?? ref.id);
		if (isImageRefPath(path ?? ref.id) || node.type === "image") {
			return {
				kind: "image",
				name,
				src: live?.imageSrc,
				path,
			};
		}
		return {
			kind: "file",
			name,
			path,
			gitStatus: live?.gitStatus,
		};
	}

	if (ref.type === "url") {
		return { kind: "generic", text: live?.title ?? cachedTitle ?? ref.url };
	}

	return { kind: "generic", text: cachedTitle ?? node.text };
}
