/**
 * Right inspector panel (360px, slides in when a skill is selected).
 *
 * Metadata for the active installed skill: source, absolute path, file count,
 * total size, SKILL.md presence, and a repo link when the skill maps to a
 * curated catalog pack. The org-scoped "enabled" switch is a P2 concern (cloud
 * bindings) and intentionally omitted here to keep the local filesystem model
 * and the cloud model separate, as the spec requires.
 */

import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { ScrollArea } from "@rox/ui/scroll-area";
import { Separator } from "@rox/ui/separator";
import { LuExternalLink, LuFolderOpen, LuGithub } from "react-icons/lu";
import { sourceLabel } from "../../../../lib/constants";
import { formatBytes } from "../../../../lib/file-kind";

export interface InspectorSkill {
	name: string;
	source: string;
	absolutePath: string;
	fileCount: number;
	totalBytes: number;
	hasSkillMd: boolean;
	/** Curated-catalog repo (github.com/owner/repo) when this skill maps to one. */
	repo: string | null;
}

interface SkillInspectorProps {
	skill: InspectorSkill;
	onReveal: () => void;
	onOpenRepo: (repo: string) => void;
}

function Row({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
				{label}
			</span>
			<span className="text-xs text-foreground">{children}</span>
		</div>
	);
}

export function SkillInspector({
	skill,
	onReveal,
	onOpenRepo,
}: SkillInspectorProps) {
	return (
		<div className="flex h-full min-h-0 flex-col border-l border-border bg-card/30">
			<div className="border-b border-border px-4 py-4">
				<h3 className="truncate text-sm font-semibold text-foreground">
					{skill.name}
				</h3>
				<p className="mt-0.5 text-xs text-muted-foreground">
					Метаданные скилла
				</p>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-4 px-4 py-4">
					<Row label="Источник">
						<Badge variant="outline" className="font-mono text-[10px]">
							{sourceLabel(skill.source)}
						</Badge>
					</Row>
					<Row label="Путь">
						<span className="block max-w-full break-all select-text font-mono text-[11px] text-muted-foreground">
							{skill.absolutePath}
						</span>
					</Row>
					<Separator />
					<div className="grid grid-cols-2 gap-4">
						<Row label="Файлов">{skill.fileCount}</Row>
						<Row label="Размер">{formatBytes(skill.totalBytes)}</Row>
					</div>
					<Row label="SKILL.md">
						{skill.hasSkillMd ? "Есть" : "Отсутствует"}
					</Row>
					{skill.repo && (
						<>
							<Separator />
							<Row label="Репозиторий">
								<button
									type="button"
									onClick={() => onOpenRepo(skill.repo as string)}
									className="flex min-w-0 items-center gap-1.5 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
								>
									<LuGithub className="size-3 shrink-0" />
									<span className="truncate">{skill.repo}</span>
								</button>
							</Row>
						</>
					)}
				</div>
			</ScrollArea>
			<div className="flex flex-col gap-2 border-t border-border px-4 py-3">
				<Button
					size="sm"
					variant="outline"
					className="w-full"
					onClick={onReveal}
				>
					<LuFolderOpen className="size-4" />
					Открыть в Finder
				</Button>
				{skill.repo && (
					<Button
						size="sm"
						variant="ghost"
						className="w-full"
						onClick={() => onOpenRepo(skill.repo as string)}
					>
						<LuExternalLink className="size-4" />
						Открыть репозиторий
					</Button>
				)}
			</div>
		</div>
	);
}
