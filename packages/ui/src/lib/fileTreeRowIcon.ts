import {
	Binary,
	Box,
	Braces,
	Database,
	FileArchive,
	FileAudio,
	FileCode,
	FileCog,
	File as FileIcon,
	FileJson,
	FileText,
	FileType,
	FileVideo,
	Folder,
	FolderOpen,
	Hash,
	Image as ImageIcon,
	type LucideIcon,
	Palette,
	Settings,
	Terminal,
	Zap,
} from "lucide-react";

/**
 * Cross-platform file-tree row icon mapper (F31).
 *
 * A pure, platform-agnostic function from a file/folder name to a 14px Lucide
 * icon, keyed by extension (and a handful of config filenames). It owns no
 * filesystem, DOM, or platform handles, so the same mapping drives the desktop
 * Pierre tree, the web explorer, and the mobile file list — and stays unit
 * testable in isolation.
 *
 * Desktop already layers a colored Material-icon sprite onto Pierre's built-in
 * set for its own tree; this mapper is the shared fallback contract web/mobile
 * lead with (and the source of truth the `FileTreeRow` atom renders). Keep the
 * two coherent: when a Material slot maps a type, prefer a matching Lucide here.
 */

/** A row icon plus the semantic token used to colorize it per-platform. */
export interface FileTreeRowIcon {
	/** The Lucide component to render at 14px. */
	Icon: LucideIcon;
	/**
	 * Stable color token (e.g. `"javascript"`, `"python"`). Platforms map this
	 * onto their palette; `"default"` reads as muted-foreground. Kept separate
	 * from the component so the same icon can carry different tints.
	 */
	colorToken: FileTreeIconColorToken;
}

export type FileTreeIconColorToken =
	| "config"
	| "css"
	| "data"
	| "default"
	| "doc"
	| "folder"
	| "image"
	| "javascript"
	| "json"
	| "media"
	| "python"
	| "rust"
	| "shell"
	| "typescript"
	| "wasm";

/**
 * Exact filename matches (lowercased), checked before extension lookup so that
 * `config`-shaped files (`config`, `*.config.*`, dotfiles) read as gear icons
 * regardless of their trailing extension.
 */
const FILE_NAME_ICONS: Record<string, FileTreeRowIcon> = {
	config: { Icon: Settings, colorToken: "config" },
	dockerfile: { Icon: Box, colorToken: "config" },
	makefile: { Icon: FileCog, colorToken: "config" },
	".gitignore": { Icon: FileCog, colorToken: "config" },
	".env": { Icon: FileCog, colorToken: "config" },
};

/**
 * Extension → icon. The longest matching compound suffix wins (`d.ts` before
 * `ts`), mirroring how the desktop Material manifest resolves icons, so a
 * declaration file doesn't collapse onto the generic TS icon.
 */
const EXTENSION_ICONS: Record<string, FileTreeRowIcon> = {
	// Scripts / languages
	js: { Icon: Zap, colorToken: "javascript" },
	mjs: { Icon: Zap, colorToken: "javascript" },
	cjs: { Icon: Zap, colorToken: "javascript" },
	jsx: { Icon: Zap, colorToken: "javascript" },
	ts: { Icon: FileType, colorToken: "typescript" },
	"d.ts": { Icon: FileType, colorToken: "typescript" },
	tsx: { Icon: FileType, colorToken: "typescript" },
	py: { Icon: FileCode, colorToken: "python" },
	pyi: { Icon: FileCode, colorToken: "python" },
	rs: { Icon: FileCode, colorToken: "rust" },
	go: { Icon: FileCode, colorToken: "default" },
	rb: { Icon: FileCode, colorToken: "default" },
	swift: { Icon: FileCode, colorToken: "default" },
	// Shell
	sh: { Icon: Terminal, colorToken: "shell" },
	bash: { Icon: Terminal, colorToken: "shell" },
	zsh: { Icon: Terminal, colorToken: "shell" },
	fish: { Icon: Terminal, colorToken: "shell" },
	// Config / data
	json: { Icon: Braces, colorToken: "json" },
	jsonc: { Icon: Braces, colorToken: "json" },
	json5: { Icon: Braces, colorToken: "json" },
	yaml: { Icon: FileJson, colorToken: "config" },
	yml: { Icon: FileJson, colorToken: "config" },
	toml: { Icon: Settings, colorToken: "config" },
	ini: { Icon: Settings, colorToken: "config" },
	cfg: { Icon: Settings, colorToken: "config" },
	conf: { Icon: Settings, colorToken: "config" },
	env: { Icon: FileCog, colorToken: "config" },
	lock: { Icon: Hash, colorToken: "config" },
	sql: { Icon: Database, colorToken: "data" },
	db: { Icon: Database, colorToken: "data" },
	sqlite: { Icon: Database, colorToken: "data" },
	csv: { Icon: Database, colorToken: "data" },
	// Styles
	css: { Icon: Palette, colorToken: "css" },
	scss: { Icon: Palette, colorToken: "css" },
	sass: { Icon: Palette, colorToken: "css" },
	less: { Icon: Palette, colorToken: "css" },
	// Markup / docs
	md: { Icon: FileText, colorToken: "doc" },
	mdx: { Icon: FileText, colorToken: "doc" },
	txt: { Icon: FileText, colorToken: "doc" },
	html: { Icon: FileCode, colorToken: "default" },
	xml: { Icon: FileCode, colorToken: "default" },
	// Binaries / media
	wasm: { Icon: Binary, colorToken: "wasm" },
	png: { Icon: ImageIcon, colorToken: "image" },
	jpg: { Icon: ImageIcon, colorToken: "image" },
	jpeg: { Icon: ImageIcon, colorToken: "image" },
	gif: { Icon: ImageIcon, colorToken: "image" },
	svg: { Icon: ImageIcon, colorToken: "image" },
	webp: { Icon: ImageIcon, colorToken: "image" },
	ico: { Icon: ImageIcon, colorToken: "image" },
	mp4: { Icon: FileVideo, colorToken: "media" },
	webm: { Icon: FileVideo, colorToken: "media" },
	mov: { Icon: FileVideo, colorToken: "media" },
	mp3: { Icon: FileAudio, colorToken: "media" },
	wav: { Icon: FileAudio, colorToken: "media" },
	zip: { Icon: FileArchive, colorToken: "default" },
	tar: { Icon: FileArchive, colorToken: "default" },
	gz: { Icon: FileArchive, colorToken: "default" },
};

const FOLDER_CLOSED: FileTreeRowIcon = { Icon: Folder, colorToken: "folder" };
const FOLDER_OPEN: FileTreeRowIcon = { Icon: FolderOpen, colorToken: "folder" };
const DEFAULT_FILE: FileTreeRowIcon = {
	Icon: FileIcon,
	colorToken: "default",
};

/**
 * Resolve the row icon for a file or folder name.
 *
 * Folders return a folder/open-folder icon (an open folder when `isOpen`).
 * Files resolve by exact filename first (so `config`, `Dockerfile`, dotfiles
 * win), then by the longest matching extension suffix, falling back to a
 * generic file icon. Always returns a result so every row gets an icon.
 */
export function fileTreeRowIcon(
	name: string,
	isDirectory: boolean,
	isOpen = false,
): FileTreeRowIcon {
	if (isDirectory) {
		return isOpen ? FOLDER_OPEN : FOLDER_CLOSED;
	}

	const lower = name.toLowerCase();
	if (FILE_NAME_ICONS[lower]) return FILE_NAME_ICONS[lower];

	// `foo.config.js` and friends read as config regardless of the trailing ext.
	if (lower.includes(".config.")) {
		return { Icon: Settings, colorToken: "config" };
	}

	const dotIndex = lower.indexOf(".");
	if (dotIndex !== -1) {
		const afterFirstDot = lower.slice(dotIndex + 1);
		const segments = afterFirstDot.split(".");
		// Longest compound suffix first: `d.ts` before `ts`.
		for (let i = 0; i < segments.length; i++) {
			const ext = segments.slice(i).join(".");
			if (EXTENSION_ICONS[ext]) return EXTENSION_ICONS[ext];
		}
	}

	return DEFAULT_FILE;
}
