/**
 * Skills library — three-zone shell (P0/MVP).
 *
 * [ Sidebar 320px ] | [ Center: detail | catalog ] | [ Inspector 360px ]
 *
 * Owns data (electronTrpc.skillsLibrary.list), tab/search/filter/selection
 * state, fuzzy filtering (fuse.js core), and the curated catalog model. The
 * three zones are resizable with persisted sizes (react-resizable-panels via
 * @rox/ui), mounted inside <DashboardSurface width="full" bare> so the surface
 * owns the full width with no centred gutter. The inspector animates in when a
 * skill is selected.
 *
 * Cross-platform: all parsing/search/catalog logic lives in `../../lib` (pure,
 * React-agnostic); only this shell and the hooks bind to electron-tRPC.
 */

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@rox/ui/empty";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import {
	AnimatedPresence,
	motionSpring,
	useShouldAnimate,
} from "@rox/ui/motion";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@rox/ui/resizable";
import { toast } from "@rox/ui/sonner";
import { motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { LuLibrary, LuPlus } from "react-icons/lu";
import { DashboardSurface } from "renderer/components/DashboardSurface";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useExternalActions } from "../../hooks/useExternalActions";
import { useSkillInstall } from "../../hooks/useSkillInstall";
import {
	buildCatalog,
	type InstalledSkillRef,
	repoUrl,
} from "../../lib/catalog";
import {
	type InstallStateFilterValue,
	SKILLS_LAYOUT_AUTOSAVE_ID,
	type SourceFilterValue,
} from "../../lib/constants";
import { createSkillSearch } from "../../lib/skill-search";
import { SkillCatalogGrid } from "./components/SkillCatalogGrid";
import { SkillDetailPane } from "./components/SkillDetailPane";
import {
	type InspectorSkill,
	SkillInspector,
} from "./components/SkillInspector";
import {
	type SidebarSkillRow,
	SkillsSidebar,
	type SkillsTab,
} from "./components/SkillsSidebar";

export function SkillsLibraryView() {
	const { data: skills, isLoading } = electronTrpc.skillsLibrary.list.useQuery(
		undefined,
		{ staleTime: 30_000 },
	);
	const { revealInFinder, openExternalUrl } = useExternalActions();

	const [tab, setTab] = useState<SkillsTab>("installed");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [activeSources, setActiveSources] = useState<SourceFilterValue[]>([]);
	const [installStateFilter, setInstallStateFilter] =
		useState<InstallStateFilterValue | null>(null);

	const { installPack, installingSlug } = useSkillInstall({
		onInstalled: ({ installed: landed }) => {
			// Jump to the first freshly-installed skill's detail so the install is
			// immediately visible. Installed-skill ids are `claude:<name>`.
			const first = landed[0];
			if (first) {
				setSelectedId(`claude:${first}`);
				setTab("installed");
			}
		},
	});

	const installed = skills ?? [];

	const utils = electronTrpc.useUtils();
	// Dirty state of the currently-open detail pane, lifted so a skill switch can
	// guard against losing unsaved edits.
	const [detailDirty, setDetailDirty] = useState(false);
	// A skill selection held back while the open editor has unsaved edits.
	const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [newSkillName, setNewSkillName] = useState("");
	// Save-and-switch hook installed by the detail pane is not available here, so
	// the guard offers discard / cancel; the detail pane owns explicit save.
	const detailDirtyRef = useRef(false);
	detailDirtyRef.current = detailDirty;

	const selectSkill = (id: string | null) => {
		if (id === selectedId) return;
		if (detailDirtyRef.current && id !== null) {
			setPendingSelectId(id);
			return;
		}
		setSelectedId(id);
	};

	const createSkillMutation =
		electronTrpc.skillsLibrary.createSkill.useMutation({
			onSuccess: (data) => {
				toast.success(`Скилл «${data.slug}» создан`);
				void utils.skillsLibrary.list.invalidate();
				setSelectedId(data.id);
				setTab("installed");
			},
			onError: (error) => toast.error(`Не удалось создать: ${error.message}`),
		});

	// --- Catalog model (curated packs + install state). ------------------------
	const catalog = useMemo(() => {
		const refs: InstalledSkillRef[] = installed.map((skill) => ({
			id: skill.id,
			slug: skill.slug,
			name: skill.name,
		}));
		return buildCatalog(refs);
	}, [installed]);

	// --- Installed list: source filter + fuzzy search. -------------------------
	const installedSearch = useMemo(
		() =>
			createSkillSearch(
				installed.map((skill) => ({
					id: skill.id,
					name: skill.name,
					slug: skill.slug,
					description: skill.description,
					source: skill.source,
				})),
			),
		[installed],
	);

	const filteredInstalled: SidebarSkillRow[] = useMemo(() => {
		const sourceFiltered =
			activeSources.length === 0
				? installed
				: installed.filter((skill) =>
						activeSources.includes(skill.source as SourceFilterValue),
					);
		const allowedIds = new Set(sourceFiltered.map((skill) => skill.id));
		const ranked = installedSearch.search(search);
		return ranked
			.filter((row) => allowedIds.has(row.id))
			.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description ?? null,
				source: row.source ?? "",
			}));
	}, [installed, activeSources, installedSearch, search]);

	// --- Catalog: install-state filter + fuzzy search. -------------------------
	const catalogSearch = useMemo(
		() =>
			createSkillSearch(
				catalog.map((item) => ({
					id: item.id,
					name: item.name,
					description: item.description,
					repo: item.repo,
				})),
			),
		[catalog],
	);

	const filteredCatalog = useMemo(() => {
		const ranked = catalogSearch.search(search);
		const order = new Map(ranked.map((row, index) => [row.id, index]));
		return catalog
			.filter((item) => order.has(item.id))
			.filter((item) =>
				installStateFilter === null
					? true
					: item.installState === installStateFilter,
			)
			.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
	}, [catalog, catalogSearch, search, installStateFilter]);

	// --- Selection + inspector model. ------------------------------------------
	const selectedSkill =
		installed.find((skill) => skill.id === selectedId) ?? null;
	const selectedDetail = electronTrpc.skillsLibrary.get.useQuery(
		{ id: selectedId ?? "" },
		{ enabled: selectedId !== null, staleTime: 30_000 },
	);

	const inspectorSkill: InspectorSkill | null = useMemo(() => {
		if (!selectedSkill) return null;
		const detail = selectedDetail.data;
		const repoMatch = catalog.find(
			(item) => item.installedSkillId === selectedSkill.id,
		);
		const files = detail?.files ?? [];
		return {
			name: selectedSkill.name,
			source: selectedSkill.source,
			absolutePath: selectedSkill.absolutePath,
			fileCount: files.length,
			totalBytes: files.reduce((sum, file) => sum + file.size, 0),
			hasSkillMd: selectedSkill.hasSkillMd,
			repo: repoMatch?.repo ?? null,
		};
	}, [selectedSkill, selectedDetail.data, catalog]);

	const toggleSource = (source: SourceFilterValue) => {
		setActiveSources((prev) =>
			prev.includes(source)
				? prev.filter((value) => value !== source)
				: [...prev, source],
		);
	};

	const openInstalledFromCatalog = (skillId: string) => {
		selectSkill(skillId);
		setTab("installed");
	};

	const showInspector = tab === "installed" && inspectorSkill !== null;
	const inspectorAnimates = useShouldAnimate("essential");

	return (
		<DashboardSurface width="full" bare>
			<div className="flex h-full min-h-0 w-full overflow-hidden">
				<ResizablePanelGroup
					direction="horizontal"
					autoSaveId={SKILLS_LAYOUT_AUTOSAVE_ID}
					className="h-full min-h-0 flex-1"
				>
					<ResizablePanel
						defaultSize={26}
						minSize={18}
						maxSize={38}
						className="min-w-[16rem]"
					>
						<SkillsSidebar
							tab={tab}
							onTabChange={setTab}
							installedCount={installed.length}
							catalogCount={catalog.length}
							search={search}
							onSearchChange={setSearch}
							activeSources={activeSources}
							onToggleSource={toggleSource}
							installStateFilter={installStateFilter}
							onInstallStateChange={setInstallStateFilter}
							skills={filteredInstalled}
							totalInstalled={installed.length}
							isLoading={isLoading}
							selectedId={selectedId}
							onSelect={selectSkill}
							headerAction={
								<Button
									size="sm"
									variant="outline"
									className="h-7 gap-1 px-2 text-xs"
									onClick={() => {
										setNewSkillName("");
										setCreateOpen(true);
									}}
								>
									<LuPlus className="size-3.5" />
									Новый скилл
								</Button>
							}
						/>
					</ResizablePanel>
					<ResizableHandle withHandle />
					<ResizablePanel defaultSize={74} minSize={42}>
						<div className="flex h-full min-h-0 flex-col border-l border-border">
							{tab === "catalog" ? (
								<SkillCatalogGrid
									items={filteredCatalog}
									totalCount={catalog.length}
									onOpenInstalled={openInstalledFromCatalog}
									onOpenRepo={openExternalUrl}
									onInstall={installPack}
									installingSlug={installingSlug}
								/>
							) : selectedSkill ? (
								<SkillDetailPane
									key={selectedSkill.id}
									skillId={selectedSkill.id}
									onSaved={() => toast.success("Файл скилла сохранён")}
									onDirtyChange={setDetailDirty}
									onDeleted={() => {
										setDetailDirty(false);
										setSelectedId(null);
									}}
									onDuplicated={(newSkillId) => {
										setDetailDirty(false);
										setSelectedId(newSkillId);
									}}
								/>
							) : (
								<Empty className="m-auto">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<LuLibrary className="size-6" />
										</EmptyMedia>
										<EmptyTitle>Выберите скилл</EmptyTitle>
										<EmptyDescription>
											Слева — список установленных навыков. Откройте любой,
											чтобы посмотреть и отредактировать его файлы.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							)}
						</div>
					</ResizablePanel>
				</ResizablePanelGroup>

				{/* Inspector: fixed-width slide-in pane (appears on selection), kept
				    outside the resizable group so add/remove never reorders the
				    persisted panel layout. */}
				<AnimatedPresence initial={false}>
					{showInspector && inspectorSkill && (
						<motion.div
							key="inspector"
							className="h-full shrink-0 overflow-hidden"
							initial={inspectorAnimates ? { width: 0, opacity: 0 } : false}
							animate={{ width: "22rem", opacity: 1 }}
							exit={inspectorAnimates ? { width: 0, opacity: 0 } : undefined}
							transition={motionSpring.panel}
						>
							<div className="h-full w-[22rem]">
								<SkillInspector
									skill={inspectorSkill}
									onReveal={() => revealInFinder(inspectorSkill.absolutePath)}
									onOpenRepo={(repo) => openExternalUrl(repoUrl(repo))}
								/>
							</div>
						</motion.div>
					)}
				</AnimatedPresence>
			</div>

			{/* Create-skill prompt. */}
			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Новый скилл</DialogTitle>
						<DialogDescription>
							Будет создан каталог в ~/.claude/skills со стартовым SKILL.md.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						<Label htmlFor="skill-create-name">Имя скилла</Label>
						<Input
							id="skill-create-name"
							value={newSkillName}
							onChange={(e) => setNewSkillName(e.target.value)}
							placeholder="my-skill"
							autoFocus
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setCreateOpen(false)}>
							Отмена
						</Button>
						<Button
							disabled={!newSkillName.trim() || createSkillMutation.isPending}
							onClick={() => {
								if (!newSkillName.trim()) return;
								createSkillMutation.mutate({ name: newSkillName.trim() });
								setCreateOpen(false);
							}}
						>
							Создать
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Unsaved-edits guard when switching to a different skill. */}
			<AlertDialog
				open={pendingSelectId !== null}
				onOpenChange={(open) => {
					if (!open) setPendingSelectId(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Несохранённые изменения</AlertDialogTitle>
						<AlertDialogDescription>
							В открытом скилле есть несохранённые правки. Переключение откроет
							другой скилл и отбросит их.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Отмена</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setDetailDirty(false);
								setSelectedId(pendingSelectId);
								setPendingSelectId(null);
							}}
						>
							Продолжить без сохранения
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</DashboardSurface>
	);
}
