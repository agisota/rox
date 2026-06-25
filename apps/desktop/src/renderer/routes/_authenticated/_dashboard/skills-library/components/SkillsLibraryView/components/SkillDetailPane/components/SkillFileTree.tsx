/**
 * File list for a skill (left column of the detail pane). Flat list of the
 * skill's files (SKILL.md first), with the active file highlighted and per-file
 * size. Markdown files get a doc glyph; everything else a generic file glyph.
 *
 * Lifecycle (issue #560): when the skill is editable (`canEdit`), the header
 * exposes "Новый файл" and each row reveals rename/delete actions on hover.
 */

import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { ScrollArea } from "@rox/ui/scroll-area";
import { cn } from "@rox/ui/utils";
import {
	LuEllipsisVertical,
	LuFile,
	LuFilePlus,
	LuFileText,
	LuPencil,
	LuTrash2,
} from "react-icons/lu";
import { formatBytes, isMarkdownFile } from "../../../../../lib/file-kind";

export interface SkillFileEntry {
	relativePath: string;
	size: number;
}

interface SkillFileTreeProps {
	files: ReadonlyArray<SkillFileEntry>;
	activePath: string | null;
	onSelect: (relativePath: string) => void;
	/** Whether lifecycle actions (add/rename/delete) are available. */
	canEdit?: boolean;
	onAddFile?: () => void;
	onRenameFile?: (relativePath: string) => void;
	onDeleteFile?: (relativePath: string) => void;
}

export function SkillFileTree({
	files,
	activePath,
	onSelect,
	canEdit = false,
	onAddFile,
	onRenameFile,
	onDeleteFile,
}: SkillFileTreeProps) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			{canEdit && (
				<div className="flex items-center justify-between border-b border-border px-2 py-1.5">
					<span className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						Файлы
					</span>
					<Button
						size="sm"
						variant="ghost"
						className="h-6 gap-1 px-2 text-xs"
						onClick={onAddFile}
					>
						<LuFilePlus className="size-3.5" />
						Новый файл
					</Button>
				</div>
			)}
			{files.length === 0 ? (
				<p className="px-3 py-4 text-xs text-muted-foreground">
					Файлы не найдены.
				</p>
			) : (
				<ScrollArea className="min-h-0 flex-1">
					<ul className="flex flex-col gap-0.5 p-2">
						{files.map((file) => {
							const Icon = isMarkdownFile(file.relativePath)
								? LuFileText
								: LuFile;
							const isActive = file.relativePath === activePath;
							const isSkillMd = file.relativePath === "SKILL.md";
							return (
								<li key={file.relativePath} className="group/file relative">
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
										<span
											className={cn(
												"shrink-0 text-[10px] text-muted-foreground/70 tabular-nums",
												canEdit && "group-hover/file:invisible",
											)}
										>
											{formatBytes(file.size)}
										</span>
									</button>
									{canEdit && (
										<div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/file:opacity-100 focus-within:opacity-100">
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														size="icon"
														variant="ghost"
														className="size-6"
														aria-label={`Действия с ${file.relativePath}`}
													>
														<LuEllipsisVertical className="size-3.5" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														onSelect={() => onRenameFile?.(file.relativePath)}
													>
														<LuPencil className="size-3.5" />
														Переименовать
													</DropdownMenuItem>
													<DropdownMenuItem
														className="text-destructive focus:text-destructive"
														disabled={isSkillMd}
														onSelect={() => onDeleteFile?.(file.relativePath)}
													>
														<LuTrash2 className="size-3.5" />
														Удалить
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									)}
								</li>
							);
						})}
					</ul>
				</ScrollArea>
			)}
		</div>
	);
}
