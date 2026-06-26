import {
	FileArchive,
	FileAudio,
	FileCode,
	FileImage,
	type FileText,
	FileText as FileTextIcon,
	FileVideo,
	File as GenericFile,
} from "lucide-react";

/**
 * Map a Drive file's `mediaType` (+ name fallback) to a coarse kind used for
 * both the row/tile icon and the preview renderer. Kept pure + local to the
 * surface so it is trivially unit-testable and carries no tRPC coupling.
 */
export type FileKind =
	| "image"
	| "video"
	| "audio"
	| "pdf"
	| "text"
	| "code"
	| "archive"
	| "other";

type IconComponent = typeof FileText;

const EXT_CODE = new Set([
	"ts",
	"tsx",
	"js",
	"jsx",
	"json",
	"py",
	"rs",
	"go",
	"java",
	"c",
	"h",
	"cpp",
	"css",
	"scss",
	"html",
	"sh",
	"yml",
	"yaml",
	"toml",
	"sql",
]);
const EXT_TEXT = new Set(["txt", "md", "markdown", "rtf", "log", "csv"]);
const EXT_ARCHIVE = new Set(["zip", "tar", "gz", "rar", "7z", "bz2", "xz"]);

function ext(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Coarse classification, MIME-first with a filename-extension fallback. */
export function fileKind(mediaType: string, name: string): FileKind {
	const mime = (mediaType || "").toLowerCase();
	if (mime.startsWith("image/")) return "image";
	if (mime.startsWith("video/")) return "video";
	if (mime.startsWith("audio/")) return "audio";
	if (mime === "application/pdf") return "pdf";
	if (mime.startsWith("text/")) {
		return mime.includes("html") || mime.includes("css") ? "code" : "text";
	}
	if (
		mime.includes("json") ||
		mime.includes("javascript") ||
		mime.includes("xml")
	) {
		return "code";
	}
	if (mime.includes("zip") || mime.includes("compressed")) return "archive";

	const e = ext(name);
	if (EXT_CODE.has(e)) return "code";
	if (EXT_TEXT.has(e)) return "text";
	if (EXT_ARCHIVE.has(e)) return "archive";
	if (e === "pdf") return "pdf";
	return "other";
}

const ICON_BY_KIND: Record<FileKind, IconComponent> = {
	image: FileImage,
	video: FileVideo,
	audio: FileAudio,
	pdf: FileTextIcon,
	text: FileTextIcon,
	code: FileCode,
	archive: FileArchive,
	other: GenericFile,
};

/** The lucide icon component for a file, derived from its kind. */
export function fileIcon(mediaType: string, name: string): IconComponent {
	return ICON_BY_KIND[fileKind(mediaType, name)];
}

/** Kinds that can be rendered inline in the preview sheet. */
export function isPreviewable(kind: FileKind): boolean {
	return (
		kind === "image" ||
		kind === "video" ||
		kind === "audio" ||
		kind === "pdf" ||
		kind === "text" ||
		kind === "code"
	);
}
