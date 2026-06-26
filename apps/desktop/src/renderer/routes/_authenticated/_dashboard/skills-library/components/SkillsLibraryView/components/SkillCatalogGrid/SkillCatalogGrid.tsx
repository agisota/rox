/**
 * Center "Каталог" view: browse and install curated skill packs.
 *
 * Cards from `CURATED_DEFAULT_SKILL_PACKS` (the single source of truth) with an
 * install-state pill, repo link, and hover spring. Installed packs offer
 * "Открыть" (jump to the installed skill's detail). Available packs offer a
 * working "Установить" CTA wired to `skillsLibrary.install`, which extracts the
 * pack's skills from the app's bundled archive into `~/.claude/skills` (no
 * network). The button shows a spinner while its own pack installs.
 */

import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@rox/ui/empty";
import {
	MotionList,
	MotionListItem,
	motionSpring,
	useShouldAnimate,
} from "@rox/ui/motion";
import { ScrollArea } from "@rox/ui/scroll-area";
import { cn } from "@rox/ui/utils";
import { motion } from "motion/react";
import {
	LuBookOpen,
	LuDownload,
	LuExternalLink,
	LuGithub,
	LuLoaderCircle,
} from "react-icons/lu";
import type { CatalogItem } from "../../../../lib/catalog";
import { repoUrl } from "../../../../lib/catalog";

interface SkillCatalogGridProps {
	items: ReadonlyArray<CatalogItem>;
	totalCount: number;
	onOpenInstalled: (skillId: string) => void;
	onOpenRepo: (url: string) => void;
	onInstall: (slug: string) => void;
	/** Slug of the pack currently installing (drives the per-card spinner). */
	installingSlug: string | null;
}

function CatalogCard({
	item,
	onOpenInstalled,
	onOpenRepo,
	onInstall,
	installingSlug,
}: {
	item: CatalogItem;
	onOpenInstalled: (skillId: string) => void;
	onOpenRepo: (url: string) => void;
	onInstall: (slug: string) => void;
	installingSlug: string | null;
}) {
	const shouldAnimate = useShouldAnimate("decorative");
	const installed = item.installState === "installed";
	const isInstalling = installingSlug === item.id;
	const installDisabled = installingSlug !== null;

	return (
		<motion.div
			className={cn(
				"group flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors",
				"hover:border-primary",
			)}
			whileHover={shouldAnimate ? { y: -2 } : undefined}
			transition={motionSpring.panel}
		>
			<div className="flex items-start justify-between gap-2">
				<h3 className="min-w-0 truncate text-sm font-medium text-foreground group-hover:text-primary">
					{item.name}
				</h3>
				<Badge
					variant={installed ? "default" : "outline"}
					className="shrink-0 text-[10px]"
				>
					{installed ? "Установлен" : "Доступен"}
				</Badge>
			</div>
			<p className="line-clamp-3 text-xs text-muted-foreground">
				{item.description}
			</p>
			<button
				type="button"
				onClick={() => onOpenRepo(repoUrl(item.repo))}
				className="flex min-w-0 items-center gap-1.5 text-left font-mono text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
			>
				<LuGithub className="size-3 shrink-0" />
				<span className="truncate">{item.repo}</span>
			</button>
			<div className="mt-auto flex items-center gap-1.5 pt-1">
				{installed && item.installedSkillId ? (
					<Button
						size="sm"
						variant="secondary"
						className="flex-1"
						onClick={() => onOpenInstalled(item.installedSkillId as string)}
					>
						<LuBookOpen className="size-4" />
						Открыть
					</Button>
				) : (
					<Button
						size="sm"
						variant="outline"
						className="flex-1"
						disabled={installDisabled}
						onClick={() => onInstall(item.id)}
					>
						{isInstalling ? (
							<LuLoaderCircle className="size-4 animate-spin" />
						) : (
							<LuDownload className="size-4" />
						)}
						{isInstalling ? "Установка…" : "Установить"}
					</Button>
				)}
				<Button
					size="icon-sm"
					variant="ghost"
					onClick={() => onOpenRepo(repoUrl(item.repo))}
					aria-label="Открыть репозиторий"
				>
					<LuExternalLink className="size-4" />
				</Button>
			</div>
		</motion.div>
	);
}

export function SkillCatalogGrid({
	items,
	totalCount,
	onOpenInstalled,
	onOpenRepo,
	onInstall,
	installingSlug,
}: SkillCatalogGridProps) {
	if (items.length === 0) {
		return (
			<Empty className="m-auto">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<LuBookOpen className="size-6" />
					</EmptyMedia>
					<EmptyTitle>
						{totalCount === 0 ? "Каталог недоступен" : "Ничего не найдено."}
					</EmptyTitle>
					<EmptyDescription>
						{totalCount === 0
							? "Курируемый каталог скиллов сейчас пуст."
							: "Измените запрос или фильтр, чтобы увидеть пакеты."}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<ScrollArea className="h-full min-h-0">
			<MotionList className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
				{items.map((item) => (
					<MotionListItem key={item.id} className="h-full">
						<CatalogCard
							item={item}
							onOpenInstalled={onOpenInstalled}
							onOpenRepo={onOpenRepo}
							onInstall={onInstall}
							installingSlug={installingSlug}
						/>
					</MotionListItem>
				))}
			</MotionList>
		</ScrollArea>
	);
}
