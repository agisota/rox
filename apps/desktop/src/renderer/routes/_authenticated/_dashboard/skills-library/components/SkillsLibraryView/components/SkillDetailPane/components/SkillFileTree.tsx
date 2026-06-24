/**
 * File list for a skill (left column of the detail pane). Flat list of the
 * skill's files (SKILL.md first), with the active file highlighted and per-file
 * size. Markdown files get a doc glyph; everything else a generic file glyph.
 */

import { ScrollArea } from "@rox/ui/scroll-area";
import { cn } from "@rox/ui/utils";
import { LuFile, LuFileText } from "react-icons/lu";
import { formatBytes, isMarkdownFile } from "../../../../../lib/file-kind";

export interface SkillFileEntry {
	relativePath: string;
	size: number;
}

interface SkillFileTreeProps {
	files: ReadonlyArray<SkillFileEntry>;
	activePath: string | null;
	onSelect: (relativePath: string) => void;
}

export function SkillFileTree({
	files,
	activePath,
	onSelect,
}: SkillFileTreeProps) {
	if (files.length === 0) {
		return (
			<p className="px-3 py-4 text-xs text-muted-foreground">
				Файлы не найдены.
			</p>
		);
	}

	return (
		<ScrollArea className="h-full min-h-0">
			<ul className="flex flex-col gap-0.5 p-2">
				{files.map((file) => {
					const Icon = isMarkdownFile(file.relativePath) ? LuFileText : LuFile;
					const isActive = file.relativePath === activePath;
					return (
						<li key={file.relativePath}>
							<button
								type="button"
								onClick={() => onSelect(file.relativePath)}
								title={file.relativePath}
								className={cn(
									"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
									isActive
										? "bg-accent text-foreground"
										: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
								)}
							>
								<Icon className="size-3.5 shrink-0" />
								<span className="min-w-0 flex-1 truncate font-mono">
									{file.relativePath}
								</span>
								<span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
									{formatBytes(file.size)}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</ScrollArea>
	);
}
