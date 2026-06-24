/**
 * File-kind classification for the Skills library editor (core, pure).
 *
 * Maps a skill file's relative path to: which CodeMirror language extension to
 * load, whether it is editable text vs. a binary blob the editor must refuse,
 * and whether a markdown preview tab applies. Used by both the editor and the
 * file tree so behavior stays consistent.
 */

export type SkillFileLanguage =
	| "markdown"
	| "yaml"
	| "json"
	| "shell"
	| "javascript"
	| "plaintext";

/** Extensions we render as code but have no dedicated CM mode → plaintext. */
const TEXT_EXTENSIONS = new Set([
	"md",
	"mdx",
	"markdown",
	"txt",
	"text",
	"yml",
	"yaml",
	"json",
	"jsonc",
	"sh",
	"bash",
	"zsh",
	"fish",
	"js",
	"cjs",
	"mjs",
	"jsx",
	"ts",
	"tsx",
	"toml",
	"ini",
	"cfg",
	"conf",
	"env",
	"xml",
	"html",
	"css",
	"py",
	"rb",
	"go",
	"rs",
	"java",
	"sql",
	"csv",
	"tsv",
	"properties",
	"gitignore",
	"dockerignore",
	"editorconfig",
	"lock",
]);

/** Common binary/asset extensions the in-app editor cannot meaningfully show. */
const BINARY_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"avif",
	"bmp",
	"ico",
	"svgz",
	"pdf",
	"zip",
	"gz",
	"tar",
	"tgz",
	"bz2",
	"7z",
	"rar",
	"mp3",
	"wav",
	"ogg",
	"flac",
	"mp4",
	"mov",
	"webm",
	"mkv",
	"woff",
	"woff2",
	"ttf",
	"otf",
	"eot",
	"wasm",
	"bin",
	"exe",
	"dll",
	"dylib",
	"so",
	"node",
	"class",
	"o",
	"a",
	"db",
	"sqlite",
]);

function extensionOf(relativePath: string): string {
	const base = relativePath.split("/").pop() ?? relativePath;
	const dot = base.lastIndexOf(".");
	if (dot <= 0) return ""; // no ext, or dotfile like `.gitignore`
	return base.slice(dot + 1).toLowerCase();
}

/** Resolve the CodeMirror language for a skill file. */
export function languageForFile(relativePath: string): SkillFileLanguage {
	const ext = extensionOf(relativePath);
	switch (ext) {
		case "md":
		case "mdx":
		case "markdown":
			return "markdown";
		case "yml":
		case "yaml":
			return "yaml";
		case "json":
		case "jsonc":
			return "json";
		case "sh":
		case "bash":
		case "zsh":
		case "fish":
		case "env":
			return "shell";
		case "js":
		case "cjs":
		case "mjs":
		case "jsx":
			return "javascript";
		default:
			return "plaintext";
	}
}

/** Is this a markdown document (eligible for the read-only preview tab)? */
export function isMarkdownFile(relativePath: string): boolean {
	return languageForFile(relativePath) === "markdown";
}

/** Should the editor treat this file as editable text (vs. a binary blob)? */
export function isEditableTextFile(relativePath: string): boolean {
	const ext = extensionOf(relativePath);
	if (ext === "") return true; // dotfiles / extensionless are usually text config
	if (BINARY_EXTENSIONS.has(ext)) return false;
	return TEXT_EXTENSIONS.has(ext) || !BINARY_EXTENSIONS.has(ext);
}

/** Human-readable file size for inspector/banners (RU-friendly units). */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} Б`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
