/**
 * Left navigation panel for the Skills library.
 *
 * Header + segmented tab (Установленные | Каталог with counts) + fuzzy search +
 * source/install-state filter chips + the installed-skills list (MotionList
 * stagger). Pure presentational: all data + filter state lives in the shell so
 * the same panel serves both tabs.
 */

import { Badge } from "@rox/ui/badge";
import { Input } from "@rox/ui/input";
import { MotionList, MotionListItem } from "@rox/ui/motion";
import { ScrollArea } from "@rox/ui/scroll-area";
import { Skeleton } from "@rox/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { cn } from "@rox/ui/utils";
import type { ReactNode } from "react";
import { LuSearch } from "react-icons/lu";
import {
	INSTALL_STATE_FILTERS,
	type InstallStateFilterValue,
	SOURCE_FILTERS,
	type SourceFilterValue,
	sourceLabel,
} from "../../../../lib/constants";

export interface SidebarSkillRow {
	id: string;
	name: string;
	description: string | null;
	source: string;
}

export type SkillsTab = "installed" | "catalog";

interface SkillsSidebarProps {
	tab: SkillsTab;
	onTabChange: (tab: SkillsTab) => void;
	installedCount: number;
	catalogCount: number;
	search: string;
	onSearchChange: (value: string) => void;
	// Installed-view filter chips.
	activeSources: SourceFilterValue[];
	onToggleSource: (source: SourceFilterValue) => void;
	// Catalog-view filter chips.
	installStateFilter: InstallStateFilterValue | null;
	onInstallStateChange: (value: InstallStateFilterValue | null) => void;
	// Installed list (rendered only on the "installed" tab).
	skills: ReadonlyArray<SidebarSkillRow>;
	totalInstalled: number;
	isLoading: boolean;
	selectedId: string | null;
	onSelect: (id: string) => void;
	/** Optional action rendered in the header (e.g. "Новый скилл"). */
	headerAction?: ReactNode;
}

export function SkillsSidebar({
	tab,
	onTabChange,
	installedCount,
	catalogCount,
	search,
	onSearchChange,
	activeSources,
	onToggleSource,
	installStateFilter,
	onInstallStateChange,
	skills,
	totalInstalled,
	isLoading,
	selectedId,
	onSelect,
	headerAction,
}: SkillsSidebarProps) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex flex-col gap-3 border-b border-border px-4 py-4">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<h1 className="text-lg font-semibold text-foreground">
							Библиотека скиллов
						</h1>
						<p className="text-sm text-muted-foreground">
							Установленные навыки агентов.
						</p>
					</div>
					{headerAction && <div className="shrink-0">{headerAction}</div>}
				</div>
				<Tabs
					value={tab}
					onValueChange={(next) => onTabChange(next as SkillsTab)}
				>
					<TabsList className="w-full">
						<TabsTrigger value="installed" className="flex-1 text-xs">
							Установленные ({installedCount})
						</TabsTrigger>
						<TabsTrigger value="catalog" className="flex-1 text-xs">
							Каталог ({catalogCount})
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<div className="relative">
					<LuSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
					<Input
						data-onboarding-anchor="skill-search"
						value={search}
						onChange={(event) => onSearchChange(event.target.value)}
						placeholder="Поиск скиллов"
						className="pl-8"
					/>
				</div>
				{tab === "installed" ? (
					<div className="flex flex-wrap gap-1.5">
						{SOURCE_FILTERS.map((filter: (typeof SOURCE_FILTERS)[number]) => {
							const active = activeSources.includes(filter.value);
							return (
								<button
									key={filter.value}
									type="button"
									onClick={() => onToggleSource(filter.value)}
								>
									<Badge
										variant={active ? "default" : "outline"}
										className="cursor-pointer font-mono text-[10px]"
									>
										{filter.label}
									</Badge>
								</button>
							);
						})}
					</div>
				) : (
					<div className="flex flex-wrap gap-1.5">
						{INSTALL_STATE_FILTERS.map(
							(filter: (typeof INSTALL_STATE_FILTERS)[number]) => {
								const active = installStateFilter === filter.value;
								return (
									<button
										key={filter.value}
										type="button"
										onClick={() =>
											onInstallStateChange(active ? null : filter.value)
										}
									>
										<Badge
											variant={active ? "default" : "outline"}
											className="cursor-pointer text-[10px]"
										>
											{filter.label}
										</Badge>
									</button>
								);
							},
						)}
					</div>
				)}
			</div>

			{tab === "installed" && (
				<ScrollArea className="min-h-0 flex-1">
					<div className="p-2">
						{isLoading ? (
							<div className="flex flex-col gap-2 p-2">
								{Array.from({ length: 6 }).map((_, index) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
									<Skeleton key={index} className="h-12 w-full rounded-md" />
								))}
							</div>
						) : skills.length === 0 ? (
							<p className="px-2 py-6 text-center text-sm text-muted-foreground">
								{totalInstalled === 0
									? "Скиллы не найдены."
									: "Ничего не найдено."}
							</p>
						) : (
							<MotionList className="flex flex-col gap-0.5">
								{skills.map((skill) => {
									const isActive = skill.id === selectedId;
									return (
										<MotionListItem key={skill.id}>
											<button
												type="button"
												onClick={() => onSelect(skill.id)}
												className={cn(
													"flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
													isActive
														? "bg-accent text-foreground"
														: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
												)}
											>
												<span className="flex items-center gap-2">
													<span className="min-w-0 flex-1 truncate text-sm font-medium">
														{skill.name}
													</span>
													<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
														{sourceLabel(skill.source)}
													</span>
												</span>
												{skill.description && (
													<span className="line-clamp-2 text-xs text-muted-foreground/80">
														{skill.description}
													</span>
												)}
											</button>
										</MotionListItem>
									);
								})}
							</MotionList>
						)}
					</div>
				</ScrollArea>
			)}
		</div>
	);
}
