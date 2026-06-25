import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import {
	type FileTreeIconColorToken,
	fileTreeRowIcon,
} from "../../lib/fileTreeRowIcon";
import { cn } from "../../lib/utils";

/**
 * Cross-platform file-tree row contract (F31).
 *
 * The IDE-grade explorer row, generalized out of the desktop FilesTab so web
 * and mobile render the same anatomy: an aligned toggle slot, a 14px
 * extension icon, an ellipsis-truncated name, and a trailing decoration slot
 * (the size column already shipped on desktop flows through `decoration`).
 *
 * Anatomy, leading → trailing:
 *
 *   [guide-lines][toggle 14px][icon 14px][name … ][decoration]
 *
 * - The toggle slot is always 14px wide. Folders render a chevron that rotates
 *   when expanded; files render an empty placeholder of the same width, so file
 *   and folder icons line up in a single column regardless of depth.
 * - Nesting is drawn as 1px guide-lines, one per ancestor level, matching the
 *   desktop Pierre tree's `--trees-indent-guide-bg` rail.
 *
 * This atom is pure presentation: it owns no filesystem, tRPC, or platform
 * handles. Desktop leads the contract (its Pierre tree paints the same anatomy
 * via CSS variables); web/mobile mount this component directly.
 */

const ICON_COLOR_CLASS: Record<FileTreeIconColorToken, string> = {
	config: "text-muted-foreground",
	css: "text-pink-500",
	data: "text-emerald-500",
	default: "text-muted-foreground",
	doc: "text-sky-500",
	folder: "text-sky-400",
	image: "text-purple-500",
	javascript: "text-yellow-500",
	json: "text-amber-500",
	media: "text-fuchsia-500",
	python: "text-blue-500",
	rust: "text-orange-500",
	shell: "text-green-500",
	typescript: "text-blue-400",
	wasm: "text-indigo-500",
};

export interface FileTreeRowProps {
	/** File or folder name; drives the icon and the visible label. */
	name: string;
	/** Directory rows render a chevron toggle; files render a placeholder. */
	isDirectory: boolean;
	/** Expanded state — rotates the chevron and selects the open-folder icon. */
	isExpanded?: boolean;
	/**
	 * Nesting depth (0 = root). Drives the number of 1px guide-lines drawn to
	 * the left of the toggle, so each level reads as an indent rail.
	 */
	depth?: number;
	/** Selected styling (active row). */
	isSelected?: boolean;
	/** Trailing decoration slot — e.g. the file-size column (already shipped). */
	decoration?: ReactNode;
	/** Row activation (click / Enter). Folders toggle; files open. */
	onActivate?: () => void;
	className?: string;
}

/** Width of the toggle slot and the icon, in px (14px = the F31 spec). */
const SLOT_PX = 14;
/** Per-level indent width, in px — matches the desktop tree's level gap. */
const INDENT_PX = 10;

/**
 * Presentational IDE-style file-tree row. See the module comment for the row
 * anatomy and the cross-platform contract.
 */
export function FileTreeRow({
	name,
	isDirectory,
	isExpanded = false,
	depth = 0,
	isSelected = false,
	decoration,
	onActivate,
	className,
}: FileTreeRowProps) {
	const { Icon, colorToken } = fileTreeRowIcon(name, isDirectory, isExpanded);

	return (
		<button
			type="button"
			onClick={onActivate}
			aria-expanded={isDirectory ? isExpanded : undefined}
			data-selected={isSelected || undefined}
			className={cn(
				"group flex h-[22px] w-full items-center gap-1.5 px-3 text-xs",
				"transition-colors",
				isSelected
					? "bg-accent text-accent-foreground"
					: "text-foreground hover:bg-accent/50",
				className,
			)}
		>
			{/* Nesting guide-lines: one 1px rail per ancestor level. */}
			{depth > 0 && (
				<span
					aria-hidden
					className="flex h-full shrink-0 items-stretch"
					style={{ marginLeft: -2 }}
				>
					{Array.from({ length: depth }).map((_, level) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: depth rails are positional, not data
							key={level}
							className="border-l border-border/60"
							style={{ width: INDENT_PX }}
						/>
					))}
				</span>
			)}

			{/* Toggle slot — aligned at 14px for both files and folders. */}
			<span
				aria-hidden
				className="flex shrink-0 items-center justify-center"
				style={{ width: SLOT_PX, height: SLOT_PX }}
			>
				{isDirectory && (
					<ChevronRight
						className={cn(
							"size-3.5 text-muted-foreground transition-transform",
							isExpanded && "rotate-90",
						)}
					/>
				)}
			</span>

			{/* 14px extension icon. */}
			<Icon className={cn("size-3.5 shrink-0", ICON_COLOR_CLASS[colorToken])} />

			{/* Ellipsis-truncated name. */}
			<span className="min-w-0 flex-1 truncate text-left">{name}</span>

			{/* Trailing decoration (size column, etc). */}
			{decoration != null && (
				<span className="shrink-0 text-muted-foreground tabular-nums">
					{decoration}
				</span>
			)}
		</button>
	);
}
