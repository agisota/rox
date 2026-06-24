import type { CanvasMutationBatch } from "@rox/shared/canvas";
import {
	createInverseCanvasMutationBatch,
	rebaseCanvasMutationBatch,
} from "@rox/shared/canvas";
import { BrailleSpinner } from "@rox/ui/ai-elements/braille-spinner";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@rox/ui/command";
import { cn } from "@rox/ui/utils";
import { workspaceTrpc } from "@rox/workspace-client";
import { ReactFlowProvider } from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	Boxes,
	Download,
	FileJson,
	Plus,
	Redo2,
	TerminalSquare,
	Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerCanvasCommandHandlers } from "renderer/commandPalette/modules/canvas/commands";
import { CanvasFlow, type CanvasFlowHandle } from "./CanvasFlow";
import {
	getCanvasCapabilityCopy,
	getCanvasRiskLabel,
} from "./canvasCapabilityLabels";
import { createAddTextNodeBatch } from "./canvasFlowAdapter";

interface CanvasSurfaceProps {
	workspaceId?: string;
}

interface CanvasHistoryEntry {
	label: string;
	undoBatch: CanvasMutationBatch;
	redoBatch: CanvasMutationBatch;
}

interface CanvasSelectionState {
	nodeIds: string[];
	edgeIds: string[];
	groupIds: string[];
}

interface CanvasCommandItem {
	id: string;
	title: string;
	description: string;
	shortcut?: string;
	disabled?: boolean;
	disabledReason?: string;
	keywords?: string[];
	run: () => void | Promise<void>;
}

type SyncState = "synced" | "saving" | "offline" | "idle";

const EMPTY_SELECTION: CanvasSelectionState = {
	nodeIds: [],
	edgeIds: [],
	groupIds: [],
};

const HEADER_CAPABILITY_IDS = new Set([
	"canvas.zoomToFit",
	"canvas.autoLayout",
	"canvas.cleanLayout",
	"canvas.summarizeSelection",
	"canvas.extractTasks",
	"canvas.generateSuggestedEdges",
]);

function selectionCount(selection: CanvasSelectionState): number {
	return (
		selection.nodeIds.length +
		selection.edgeIds.length +
		selection.groupIds.length
	);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName.toLowerCase();
	return (
		tag === "input" ||
		tag === "textarea" ||
		tag === "select" ||
		target.isContentEditable
	);
}

function formatClock(date: Date): string {
	return date.toLocaleTimeString("ru-RU", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function CanvasSurface({ workspaceId }: CanvasSurfaceProps) {
	const utils = workspaceTrpc.useUtils();
	const flowRef = useRef<CanvasFlowHandle | null>(null);

	const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);
	const [selection, setSelection] =
		useState<CanvasSelectionState>(EMPTY_SELECTION);
	const [historyPast, setHistoryPast] = useState<CanvasHistoryEntry[]>([]);
	const [historyFuture, setHistoryFuture] = useState<CanvasHistoryEntry[]>([]);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);

	const canvasListQuery = workspaceTrpc.canvas.list.useQuery(
		{ workspaceId: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const capabilitiesQuery = workspaceTrpc.canvas.listCapabilities.useQuery(
		undefined,
		{ enabled: !!workspaceId },
	);

	const createCanvas = workspaceTrpc.canvas.create.useMutation({
		onSuccess: async (result) => {
			if (!workspaceId) return;
			setSelectedCanvasId(result.document.id);
			await utils.canvas.list.invalidate({ workspaceId });
		},
	});

	const patchCanvas = workspaceTrpc.canvas.patch.useMutation({
		onSuccess: async (_result, input) => {
			setLastSyncedAt(new Date());
			await utils.canvas.list.invalidate({ workspaceId: input.workspaceId });
			await utils.canvas.get.invalidate({
				workspaceId: input.workspaceId,
				canvasId: input.batch.canvasId,
			});
			await utils.canvas.getHistory.invalidate({
				workspaceId: input.workspaceId,
				canvasId: input.batch.canvasId,
			});
		},
	});

	const undoCanvas = workspaceTrpc.canvas.undo.useMutation({
		onSuccess: async (_result, input) => {
			setHistoryPast([]);
			setHistoryFuture([]);
			await utils.canvas.get.invalidate({
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			});
			await utils.canvas.getHistory.invalidate({
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			});
		},
		onError: (error) => setStatusMessage(errorMessage(error)),
	});

	const redoCanvas = workspaceTrpc.canvas.redo.useMutation({
		onSuccess: async (_result, input) => {
			setHistoryPast([]);
			setHistoryFuture([]);
			await utils.canvas.get.invalidate({
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			});
			await utils.canvas.getHistory.invalidate({
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			});
		},
		onError: (error) => setStatusMessage(errorMessage(error)),
	});

	const runCapability = workspaceTrpc.canvas.runCapability.useMutation({
		onSuccess: (_result, input) => {
			const copy = getCanvasCapabilityCopy(input.capabilityId);
			setStatusMessage(`${copy.title}: выполнено`);
		},
		onError: (error) => setStatusMessage(errorMessage(error)),
	});

	const importJsonCanvas = workspaceTrpc.canvas.importJsonCanvas.useMutation({
		onSuccess: async (result, input) => {
			setSelectedCanvasId(result.document.id);
			await utils.canvas.list.invalidate({ workspaceId: input.workspaceId });
			setStatusMessage("Импортирован JSON Canvas");
		},
		onError: (error) => setStatusMessage(errorMessage(error)),
	});

	// Bootstrap a first canvas when the workspace has none.
	useEffect(() => {
		if (!workspaceId) return;
		if (!canvasListQuery.isSuccess) return;
		if (canvasListQuery.data.length > 0) return;
		if (createCanvas.isPending) return;
		createCanvas.mutate({
			workspaceId,
			title: "Холст рабочего пространства",
			description: "Холст Set, сохраняемый как CanvasDocument на хосте.",
		});
	}, [
		canvasListQuery.data,
		canvasListQuery.isSuccess,
		createCanvas,
		workspaceId,
	]);

	const canvasList = canvasListQuery.data ?? [];
	const activeCanvasId = selectedCanvasId ?? canvasList[0]?.id ?? null;

	const activeCanvasQuery = workspaceTrpc.canvas.get.useQuery(
		{ workspaceId: workspaceId ?? "", canvasId: activeCanvasId ?? "" },
		{ enabled: !!workspaceId && !!activeCanvasId },
	);
	const historyQuery = workspaceTrpc.canvas.getHistory.useQuery(
		{ workspaceId: workspaceId ?? "", canvasId: activeCanvasId ?? "" },
		{ enabled: !!workspaceId && !!activeCanvasId },
	);

	const activeDocument = activeCanvasQuery.data?.document;
	const activeIndex =
		activeCanvasQuery.data?.index ??
		canvasList.find((canvas) => canvas.id === activeCanvasId);

	// Reset local selection + history when switching canvases. The effect runs
	// purely for the `activeCanvasId` change; biome only sees stable setters and
	// flags the dep, but it is load-bearing — keep it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset must fire on canvas switch
	useEffect(() => {
		setSelection(EMPTY_SELECTION);
		setHistoryPast([]);
		setHistoryFuture([]);
	}, [activeCanvasId]);

	const persistedPatches = historyQuery.data?.patches ?? [];
	const lastPersistedPatch = persistedPatches.at(-1);
	const canServerUndo = persistedPatches.length > 0;
	const canServerRedo =
		lastPersistedPatch?.actor.id === "host-service-undo" ||
		lastPersistedPatch?.actor.id === "renderer-undo";
	const historyPending =
		patchCanvas.isPending || undoCanvas.isPending || redoCanvas.isPending;
	const canUndo =
		(historyPast.length > 0 || canServerUndo) &&
		!!workspaceId &&
		!!activeIndex &&
		!historyPending;
	const canRedo =
		(historyFuture.length > 0 || canServerRedo) &&
		!!workspaceId &&
		!!activeIndex &&
		!historyPending;

	const syncState: SyncState = !workspaceId
		? "offline"
		: patchCanvas.isPending
			? "saving"
			: lastSyncedAt
				? "synced"
				: "idle";
	const syncLabel =
		syncState === "saving"
			? "Сохранение…"
			: syncState === "offline"
				? "Не синхронизировано"
				: syncState === "synced" && lastSyncedAt
					? `Синхронизировано · ${formatClock(lastSyncedAt)}`
					: "Готово к работе";

	const submitBatch = useCallback(
		(batch: CanvasMutationBatch, label: string) => {
			if (!workspaceId || !activeDocument || !activeIndex) return;
			let undoBatch: CanvasMutationBatch;
			try {
				undoBatch = createInverseCanvasMutationBatch({
					document: activeDocument,
					batch,
					baseVersion: activeIndex.revision + 1,
					actorId: "renderer-undo",
				});
			} catch (error) {
				setStatusMessage(errorMessage(error));
				return;
			}
			const entry: CanvasHistoryEntry = { label, undoBatch, redoBatch: batch };
			setHistoryPast((current) => [...current, entry].slice(-50));
			setHistoryFuture([]);
			patchCanvas.mutate(
				{ workspaceId, batch },
				{
					onError: (error) => {
						setHistoryPast((current) =>
							current.filter((candidate) => candidate !== entry),
						);
						setStatusMessage(errorMessage(error));
					},
				},
			);
		},
		[activeDocument, activeIndex, patchCanvas, workspaceId],
	);

	const handleCreateCanvas = useCallback(() => {
		if (!workspaceId || createCanvas.isPending) return;
		createCanvas.mutate({
			workspaceId,
			title: "Холст рабочего пространства",
			description: "Холст Set, сохраняемый как CanvasDocument на хосте.",
		});
	}, [createCanvas, workspaceId]);

	const handleCreateTextNodeAt = useCallback(
		(position: { x: number; y: number }) => {
			if (!workspaceId || !activeDocument || !activeIndex) return;
			submitBatch(
				createAddTextNodeBatch({
					document: activeDocument,
					baseVersion: activeIndex.revision,
					actorId: "renderer",
					position,
				}),
				"Текстовый узел",
			);
		},
		[activeDocument, activeIndex, submitBatch, workspaceId],
	);

	const handleAddTextNodeCenter = useCallback(() => {
		const offset = (activeDocument?.nodes.length ?? 0) * 36;
		handleCreateTextNodeAt({ x: 160 + offset, y: 140 + offset });
	}, [activeDocument?.nodes.length, handleCreateTextNodeAt]);

	const handleOpenRefNode = useCallback(
		(nodeId: string) => {
			if (!workspaceId || !activeCanvasId || runCapability.isPending) return;
			const node = activeDocument?.nodes.find((item) => item.id === nodeId);
			if (!node?.ref) return;
			const capabilityId =
				node.ref.type === "session"
					? "canvas.openLinkedSession"
					: node.ref.type === "note"
						? "canvas.openLinkedNote"
						: node.ref.type === "artifact"
							? "canvas.openLinkedArtifact"
							: "canvas.focusNode";
			runCapability.mutate({
				workspaceId,
				canvasId: activeCanvasId,
				capabilityId,
				selection: { nodeIds: [nodeId] },
			});
		},
		[activeCanvasId, activeDocument?.nodes, runCapability, workspaceId],
	);

	const handleRunCapability = useCallback(
		(capabilityId: string) => {
			if (!workspaceId || !activeCanvasId || runCapability.isPending) return;
			const input: {
				workspaceId: string;
				canvasId: string;
				capabilityId: string;
				selection?: {
					nodeIds?: string[];
					edgeIds?: string[];
					groupIds?: string[];
				};
			} = { workspaceId, canvasId: activeCanvasId, capabilityId };
			if (selectionCount(selection) > 0) {
				input.selection = {
					nodeIds: selection.nodeIds,
					edgeIds: selection.edgeIds,
					groupIds: selection.groupIds,
				};
			}
			runCapability.mutate(input);
		},
		[activeCanvasId, runCapability, selection, workspaceId],
	);

	const handleUndo = useCallback(() => {
		if (!workspaceId || !activeIndex || historyPending) return;
		const entry = historyPast.at(-1);
		if (!entry) {
			if (!activeCanvasId || !canServerUndo) return;
			undoCanvas.mutate({ workspaceId, canvasId: activeCanvasId });
			return;
		}
		const batch = rebaseCanvasMutationBatch({
			batch: entry.undoBatch,
			baseVersion: activeIndex.revision,
			actorId: "renderer-undo",
		});
		patchCanvas.mutate(
			{ workspaceId, batch },
			{
				onSuccess: () => {
					setHistoryPast((current) => current.slice(0, -1));
					setHistoryFuture((current) => [...current, entry].slice(-50));
				},
				onError: (error) => setStatusMessage(errorMessage(error)),
			},
		);
	}, [
		activeCanvasId,
		activeIndex,
		canServerUndo,
		historyPast,
		historyPending,
		patchCanvas,
		undoCanvas,
		workspaceId,
	]);

	const handleRedo = useCallback(() => {
		if (!workspaceId || !activeIndex || historyPending) return;
		const entry = historyFuture.at(-1);
		if (!entry) {
			if (!activeCanvasId || !canServerRedo) return;
			redoCanvas.mutate({ workspaceId, canvasId: activeCanvasId });
			return;
		}
		const batch = rebaseCanvasMutationBatch({
			batch: entry.redoBatch,
			baseVersion: activeIndex.revision,
			actorId: "renderer-redo",
		});
		patchCanvas.mutate(
			{ workspaceId, batch },
			{
				onSuccess: () => {
					setHistoryFuture((current) => current.slice(0, -1));
					setHistoryPast((current) => [...current, entry].slice(-50));
				},
				onError: (error) => setStatusMessage(errorMessage(error)),
			},
		);
	}, [
		activeCanvasId,
		activeIndex,
		canServerRedo,
		historyFuture,
		historyPending,
		patchCanvas,
		redoCanvas,
		workspaceId,
	]);

	const handleExportJsonCanvas = useCallback(async () => {
		if (!workspaceId || !activeCanvasId) return;
		try {
			const result = await utils.canvas.exportJsonCanvas.fetch({
				workspaceId,
				canvasId: activeCanvasId,
			});
			const text = JSON.stringify(result.jsonCanvas, null, 2);
			if (typeof navigator !== "undefined" && navigator.clipboard) {
				await navigator.clipboard.writeText(text);
				setStatusMessage("JSON Canvas скопирован в буфер обмена");
			} else {
				setStatusMessage("JSON Canvas экспортирован");
			}
		} catch (error) {
			setStatusMessage(errorMessage(error));
		}
	}, [activeCanvasId, utils.canvas.exportJsonCanvas, workspaceId]);

	const handleExportPng = useCallback(async () => {
		await flowRef.current?.exportPng();
	}, []);

	const handleImportJsonCanvas = useCallback(async () => {
		if (!workspaceId || importJsonCanvas.isPending) return;
		if (typeof navigator === "undefined" || !navigator.clipboard) {
			setStatusMessage("Буфер обмена недоступен для импорта");
			return;
		}
		try {
			const raw = await navigator.clipboard.readText();
			const jsonCanvas = JSON.parse(raw);
			importJsonCanvas.mutate({
				workspaceId,
				title: "Импортированный JSON Canvas",
				jsonCanvas,
			});
		} catch (error) {
			setStatusMessage(errorMessage(error));
		}
	}, [importJsonCanvas, workspaceId]);

	const capabilityCommands = useMemo<CanvasCommandItem[]>(() => {
		const list = capabilitiesQuery.data ?? [];
		return list.map((capability) => {
			const copy = getCanvasCapabilityCopy(capability.id, capability.label);
			const needsSelection =
				capability.requiresSelection && selectionCount(selection) === 0;
			const disabled =
				!activeCanvasId || runCapability.isPending || needsSelection;
			return {
				id: capability.id,
				title: copy.title,
				description: copy.description,
				disabled,
				disabledReason: !activeCanvasId
					? "Откройте холст, чтобы запускать действия."
					: needsSelection
						? "Выделите узлы перед запуском действия."
						: runCapability.isPending
							? "Действие уже выполняется."
							: undefined,
				keywords: [
					"действие",
					capability.id,
					...capability.risks.map(getCanvasRiskLabel),
				],
				run: () => handleRunCapability(capability.id),
			};
		});
	}, [
		activeCanvasId,
		capabilitiesQuery.data,
		handleRunCapability,
		runCapability.isPending,
		selection,
	]);

	const baseCommands = useMemo<CanvasCommandItem[]>(
		() => [
			{
				id: "canvas.addTextNode",
				title: "Добавить текстовый узел",
				description: "Создать текстовую карточку через node.add мутацию.",
				shortcut: "Двойной клик по холсту",
				disabled: !activeCanvasId || patchCanvas.isPending,
				keywords: ["узел", "текст", "создать"],
				run: handleAddTextNodeCenter,
			},
			{
				id: "canvas.undo",
				title: "Отменить",
				description: "Применить инверсный батч мутаций к документу.",
				shortcut: "Cmd/Ctrl+Z",
				disabled: !canUndo,
				keywords: ["история", "откат"],
				run: handleUndo,
			},
			{
				id: "canvas.redo",
				title: "Повторить",
				description: "Заново применить отменённый батч мутаций.",
				shortcut: "Cmd/Ctrl+Shift+Z",
				disabled: !canRedo,
				keywords: ["история", "повтор"],
				run: handleRedo,
			},
			{
				id: "canvas.exportJsonCanvas",
				title: "Экспорт JSON Canvas",
				description: "Сериализовать документ в формат Obsidian JSON Canvas.",
				shortcut: "Cmd/Ctrl+Shift+E",
				disabled: !activeCanvasId,
				keywords: ["json", "obsidian", "экспорт"],
				run: () => void handleExportJsonCanvas(),
			},
			{
				id: "canvas.exportPng",
				title: "Экспорт в PNG",
				description: "Сохранить кадр холста как изображение.",
				disabled: !activeDocument || activeDocument.nodes.length === 0,
				keywords: ["png", "картинка", "скрин", "экспорт"],
				run: () => void handleExportPng(),
			},
			{
				id: "canvas.importJsonCanvas",
				title: "Импорт JSON Canvas из буфера",
				description: "Создать новый холст из JSON Canvas в буфере обмена.",
				disabled: !workspaceId || importJsonCanvas.isPending,
				keywords: ["json", "obsidian", "импорт"],
				run: () => void handleImportJsonCanvas(),
			},
		],
		[
			activeCanvasId,
			activeDocument,
			canRedo,
			canUndo,
			handleAddTextNodeCenter,
			handleExportJsonCanvas,
			handleExportPng,
			handleImportJsonCanvas,
			handleRedo,
			handleUndo,
			importJsonCanvas.isPending,
			patchCanvas.isPending,
			workspaceId,
		],
	);

	const allCommands = useMemo(
		() => [...baseCommands, ...capabilityCommands],
		[baseCommands, capabilityCommands],
	);

	// Mirror commands into the global command-palette registry.
	useEffect(() => {
		const handlers = Object.fromEntries(
			allCommands.map((command) => [
				command.id,
				{
					title: command.title,
					description: command.description,
					shortcut: command.shortcut,
					keywords: command.keywords,
					disabled: command.disabled,
					disabledReason: command.disabledReason,
					run: command.run,
				},
			]),
		);
		return registerCanvasCommandHandlers(handlers);
	}, [allCommands]);

	const headerCapabilities = useMemo(
		() =>
			capabilityCommands.filter((command) =>
				HEADER_CAPABILITY_IDS.has(command.id),
			),
		[capabilityCommands],
	);

	// Global hotkeys: undo/redo, palette, JSON export.
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (isEditableTarget(event.target)) return;
			const key = event.key.toLowerCase();
			const isMod = event.metaKey || event.ctrlKey;
			if (isMod && key === "z" && !event.altKey) {
				event.preventDefault();
				if (event.shiftKey) handleRedo();
				else handleUndo();
				return;
			}
			if (isMod && event.shiftKey && key === "p") {
				event.preventDefault();
				setPaletteOpen((open) => !open);
				return;
			}
			if (isMod && event.shiftKey && key === "e") {
				event.preventDefault();
				void handleExportJsonCanvas();
			}
		}
		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () =>
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
	}, [handleExportJsonCanvas, handleRedo, handleUndo]);

	const isLoading =
		!!workspaceId &&
		(canvasListQuery.isLoading ||
			(canvasList.length === 0 && createCanvas.isPending) ||
			(!!activeCanvasId && activeCanvasQuery.isLoading));

	const selectedCount = selectionCount(selection);

	return (
		<div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
			<header className="glass-panel flex shrink-0 items-center justify-between gap-3 border-border/60 border-b px-4 py-2.5">
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-[var(--sidebar-primary)]/12">
						<Boxes className="size-5 text-[var(--sidebar-primary)]" />
					</div>
					<div className="min-w-0">
						<h1 className="truncate font-mono font-semibold text-foreground text-sm">
							{activeDocument?.title ?? "Холст"}
						</h1>
						<p
							className="font-mono text-muted-foreground text-xs"
							data-testid="canvas-sync-status"
						>
							{syncLabel}
						</p>
					</div>
					{canvasList.length > 1 ? (
						<div className="ml-2 hidden items-center gap-1 lg:flex">
							{canvasList.slice(0, 4).map((canvas) => (
								<button
									key={canvas.id}
									type="button"
									onClick={() => setSelectedCanvasId(canvas.id)}
									className={cn(
										"max-w-36 truncate rounded-md px-2 py-1 font-mono text-xs transition-colors",
										canvas.id === activeCanvasId
											? "bg-[var(--sidebar-primary)]/14 text-[var(--sidebar-primary)]"
											: "text-muted-foreground hover:bg-muted",
									)}
								>
									{canvas.title}
								</button>
							))}
						</div>
					) : null}
				</div>

				<div className="flex shrink-0 items-center gap-1.5">
					<Button
						size="icon-sm"
						variant="ghost"
						disabled={!canUndo}
						onClick={handleUndo}
						title="Отменить · Cmd/Ctrl+Z"
					>
						<Undo2 />
					</Button>
					<Button
						size="icon-sm"
						variant="ghost"
						disabled={!canRedo}
						onClick={handleRedo}
						title="Повторить · Cmd/Ctrl+Shift+Z"
					>
						<Redo2 />
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => setPaletteOpen(true)}
						title="Палитра команд · Cmd/Ctrl+Shift+P"
					>
						<TerminalSquare />
						Команды
					</Button>
					<Button
						size="icon-sm"
						variant="ghost"
						disabled={!activeCanvasId}
						onClick={() => void handleExportJsonCanvas()}
						title="Экспорт JSON Canvas · Cmd/Ctrl+Shift+E"
					>
						<FileJson />
					</Button>
					<Button
						size="icon-sm"
						variant="ghost"
						disabled={!activeDocument || activeDocument.nodes.length === 0}
						onClick={() => void handleExportPng()}
						title="Экспорт в PNG"
					>
						<Download />
					</Button>
					<Button
						size="icon-sm"
						variant="ghost"
						disabled={!activeCanvasId || patchCanvas.isPending}
						onClick={handleAddTextNodeCenter}
						title="Добавить текстовый узел"
					>
						<Plus />
					</Button>
					<Button
						size="sm"
						disabled={!workspaceId || createCanvas.isPending}
						onClick={handleCreateCanvas}
					>
						Новый холст
					</Button>
				</div>
			</header>

			{headerCapabilities.length > 0 ? (
				<div className="glass-panel flex shrink-0 items-center gap-1.5 overflow-x-auto border-border/60 border-b px-4 py-1.5">
					{headerCapabilities.map((command) => (
						<Button
							key={command.id}
							size="xs"
							variant="ghost"
							disabled={command.disabled}
							title={command.disabledReason ?? command.description}
							onClick={() => void command.run()}
						>
							{command.title}
						</Button>
					))}
					{selectedCount > 0 ? (
						<Badge variant="secondary" className="ml-auto font-mono">
							{selectedCount} выбрано
						</Badge>
					) : null}
				</div>
			) : null}

			<main className="relative min-h-0 flex-1">
				{isLoading ? (
					<div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
						<BrailleSpinner className="text-[var(--sidebar-primary)]" />
						<p className="font-mono text-sm">Запуск локального холста…</p>
					</div>
				) : activeDocument && activeIndex ? (
					activeDocument.nodes.length === 0 ? (
						<EmptyDocumentState onAddNode={handleAddTextNodeCenter} />
					) : (
						<ReactFlowProvider>
							<CanvasFlow
								ref={flowRef}
								baseVersion={activeIndex.revision}
								disabled={patchCanvas.isPending}
								document={activeDocument}
								modeBadge={
									patchCanvas.isPending ? "Сохранение" : "Холст · хост"
								}
								onCreateTextNodeAt={handleCreateTextNodeAt}
								onMutationBatch={submitBatch}
								onOpenRefNode={handleOpenRefNode}
								onSelectionChange={setSelection}
							/>
						</ReactFlowProvider>
					)
				) : (
					<EmptyCanvasState
						onCreate={handleCreateCanvas}
						pending={createCanvas.isPending}
						readOnly={!workspaceId}
					/>
				)}

				{statusMessage ? (
					<AnimatePresence>
						<motion.div
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 8 }}
							className="glass-panel absolute bottom-4 left-1/2 z-30 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border border-border/60 px-4 py-2"
						>
							<span className="line-clamp-2 text-foreground text-xs">
								{statusMessage}
							</span>
							<Button
								size="xs"
								variant="ghost"
								onClick={() => setStatusMessage(null)}
							>
								Скрыть
							</Button>
						</motion.div>
					</AnimatePresence>
				) : null}
			</main>

			{paletteOpen ? (
				<CanvasCommandPalette
					commands={allCommands}
					onClose={() => setPaletteOpen(false)}
				/>
			) : null}
		</div>
	);
}

function EmptyCanvasState({
	onCreate,
	pending,
	readOnly,
}: {
	onCreate: () => void;
	pending: boolean;
	readOnly: boolean;
}) {
	return (
		<div className="flex h-full w-full items-center justify-center p-8">
			<motion.div
				initial={{ opacity: 0, scale: 0.97 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.2 }}
				className="glass-panel flex max-w-md flex-col items-center gap-4 rounded-xl border border-border/60 p-8 text-center"
			>
				<div className="flex size-12 items-center justify-center rounded-lg border border-border/60 bg-[var(--sidebar-primary)]/12">
					<Boxes className="size-6 text-[var(--sidebar-primary)]" />
				</div>
				<div className="space-y-1.5">
					<h2 className="font-mono font-semibold text-foreground text-lg">
						{readOnly ? "Хост недоступен" : "Пустой холст"}
					</h2>
					<p className="text-muted-foreground text-sm leading-relaxed">
						{readOnly
							? "Холст доступен только для просмотра, пока хост не подключён."
							: "Перетащите сюда сессию, заметку или задачу, либо создайте текстовый узел двойным кликом."}
					</p>
				</div>
				{!readOnly ? (
					<Button onClick={onCreate} disabled={pending}>
						<Plus />
						Новый холст
					</Button>
				) : null}
			</motion.div>
		</div>
	);
}

function EmptyDocumentState({ onAddNode }: { onAddNode: () => void }) {
	return (
		<div className="flex h-full w-full items-center justify-center p-8">
			<motion.div
				initial={{ opacity: 0, scale: 0.97 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.2 }}
				className="flex max-w-sm flex-col items-center gap-3 text-center"
			>
				<h2 className="font-mono font-semibold text-foreground">
					Добавьте узел, чтобы начать
				</h2>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Двойной клик по холсту создаёт текстовый узел. Соединяйте узлы
					стрелками, выделяйте рамкой, группируйте через Cmd+G.
				</p>
				<Button size="sm" onClick={onAddNode}>
					<Plus />
					Текстовый узел
				</Button>
			</motion.div>
		</div>
	);
}

function CanvasCommandPalette({
	commands,
	onClose,
}: {
	commands: CanvasCommandItem[];
	onClose: () => void;
}) {
	useEffect(() => {
		function handleEscape(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [onClose]);

	return (
		<div className="absolute inset-0 z-40 flex items-start justify-center px-4 pt-24">
			<button
				type="button"
				aria-label="Закрыть палитру команд"
				className="absolute inset-0 cursor-default bg-background/60 backdrop-blur-sm"
				onClick={onClose}
			/>
			<div className="glass-panel relative w-full max-w-xl overflow-hidden rounded-xl border border-border/60">
				<Command className="bg-transparent" loop>
					<CommandInput
						autoFocus
						placeholder="Поиск действий холста, экспорта, импорта…"
					/>
					<CommandList className="max-h-[52vh]">
						<CommandEmpty>Ничего не найдено.</CommandEmpty>
						<CommandGroup heading="Команды холста">
							{commands.map((command) => (
								<CommandItem
									key={command.id}
									value={`${command.title} ${command.description} ${command.id}`}
									disabled={command.disabled}
									onSelect={() => {
										void command.run();
										onClose();
									}}
									className="flex flex-col items-start gap-0.5"
								>
									<span className="font-medium text-foreground text-sm">
										{command.title}
									</span>
									<span className="text-muted-foreground text-xs">
										{command.description}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</div>
		</div>
	);
}
