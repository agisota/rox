import type { ExternalApp } from "@rox/local-db";
import { type EmptyStateChip, EmptyStateChips } from "@rox/ui/empty-state";
import { useParams } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import type { IconType } from "react-icons";
import { BsTerminalPlus } from "react-icons/bs";
import { LuExternalLink, LuSearch, LuTrash2 } from "react-icons/lu";
import { TbMessageCirclePlus, TbWorld } from "react-icons/tb";
import { getAppOption } from "renderer/components/OpenInExternalDropdown";
import { useEmptyStateSuggestions } from "renderer/hooks/useEmptyStateSuggestions";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceDeleteHandler } from "renderer/react-query/workspaces";
import { DeleteWorkspaceDialog } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components/DeleteWorkspaceDialog/DeleteWorkspaceDialog";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import { useTheme } from "renderer/stores/theme";
import roxEmptyStateWordmark from "./assets/rox-empty-state-wordmark.svg";
import { EmptyTabActionButton } from "./components/EmptyTabActionButton";

interface EmptyTabViewProps {
	defaultExternalApp?: ExternalApp | null;
	onOpenInApp: () => void;
	onOpenQuickOpen: () => void;
}

interface EmptyTabAction {
	id: string;
	label: string;
	display: string[];
	icon: IconType;
	onClick: () => void;
}

export function EmptyTabView({
	defaultExternalApp,
	onOpenInApp,
	onOpenQuickOpen,
}: EmptyTabViewProps) {
	const { workspaceId } = useParams({
		from: "/_authenticated/_dashboard/workspace/$workspaceId/",
	});
	const addChatTab = useTabsStore((s) => s.addChatTab);
	const addBrowserTab = useTabsStore((s) => s.addBrowserTab);
	const activeTheme = useTheme();

	const { data: workspace } = electronTrpc.workspaces.get.useQuery({
		id: workspaceId,
	});
	const { addTab } = useTabsWithPresets(workspace?.projectId);
	const { showDeleteDialog, setShowDeleteDialog, handleDeleteClick } =
		useWorkspaceDeleteHandler();

	const { keys: newGroupDisplay } = useHotkeyDisplay("NEW_GROUP");
	const { keys: newChatDisplay } = useHotkeyDisplay("NEW_CHAT");
	const { keys: quickOpenDisplay } = useHotkeyDisplay("QUICK_OPEN");
	const { keys: newBrowserDisplay } = useHotkeyDisplay("NEW_BROWSER");
	const { keys: openInAppDisplay } = useHotkeyDisplay("OPEN_IN_APP");
	const resolvedExternalApp: ExternalApp = defaultExternalApp ?? "cursor";

	const handleShowTerminal = useCallback(() => {
		addTab(workspaceId);
	}, [addTab, workspaceId]);

	const handleNewAgent = useCallback(() => {
		addChatTab(workspaceId);
	}, [addChatTab, workspaceId]);

	const handleOpenBrowser = useCallback(() => {
		addBrowserTab(workspaceId);
	}, [addBrowserTab, workspaceId]);

	const openInActionLabel = useMemo(() => {
		const appOption = getAppOption(resolvedExternalApp);
		const appName = appOption?.displayLabel ?? appOption?.label;
		return appName ? `Open in ${appName}` : null;
	}, [resolvedExternalApp]);

	const actions = useMemo<EmptyTabAction[]>(() => {
		const baseActions: EmptyTabAction[] = [
			{
				id: "new-agent",
				label: "Открыть чат",
				display: newChatDisplay,
				icon: TbMessageCirclePlus,
				onClick: handleNewAgent,
			},
			{
				id: "terminal",
				label: "Открыть терминал",
				display: newGroupDisplay,
				icon: BsTerminalPlus,
				onClick: handleShowTerminal,
			},
		];

		baseActions.push({
			id: "open-browser",
			label: "Открыть браузер",
			display: newBrowserDisplay,
			icon: TbWorld,
			onClick: handleOpenBrowser,
		});

		if (openInActionLabel) {
			baseActions.push({
				id: "open-in-app",
				label: openInActionLabel,
				display: openInAppDisplay,
				icon: LuExternalLink,
				onClick: onOpenInApp,
			});
		}

		baseActions.push({
			id: "search-files",
			label: "Поиск файлов",
			display: quickOpenDisplay,
			icon: LuSearch,
			onClick: onOpenQuickOpen,
		});

		return baseActions;
	}, [
		handleNewAgent,
		handleOpenBrowser,
		handleShowTerminal,
		newBrowserDisplay,
		newChatDisplay,
		newGroupDisplay,
		openInActionLabel,
		onOpenInApp,
		onOpenQuickOpen,
		openInAppDisplay,
		quickOpenDisplay,
	]);

	// F57 (#650): AI-seeded starter chips from the shared suggestions endpoint,
	// tinted by the active workspace. Dispatch tokens map back onto the existing
	// tab handlers so a seeded chip starts the same action as its hotkey twin.
	const { suggestions, isLoading: suggestionsLoading } =
		useEmptyStateSuggestions({
			surface: "tab",
			workspaceName: workspace?.name,
		});

	const seededChips = useMemo<EmptyStateChip[]>(() => {
		const dispatch: Record<string, (() => void) | undefined> = {
			"new-chat": handleNewAgent,
			"new-terminal": handleShowTerminal,
			"new-browser": handleOpenBrowser,
			"quick-open": onOpenQuickOpen,
		};
		return suggestions
			.map((s) => {
				const onSelect = dispatch[s.prompt];
				if (!onSelect) return null;
				return { id: s.id, label: s.label, onSelect };
			})
			.filter((c): c is EmptyStateChip => c !== null);
	}, [
		suggestions,
		handleNewAgent,
		handleShowTerminal,
		handleOpenBrowser,
		onOpenQuickOpen,
	]);

	return (
		<div className="flex h-full flex-1 items-center justify-center px-6 py-10">
			<div className="w-full max-w-xl">
				<div className="mb-7 flex items-center justify-center py-3">
					<img
						alt="Rox"
						className={`h-8 w-auto select-none ${
							activeTheme?.type === "dark"
								? "opacity-85"
								: "brightness-0 opacity-75"
						}`}
						draggable={false}
						src={roxEmptyStateWordmark}
					/>
				</div>
				<div className="mx-auto grid w-full max-w-md gap-0.5">
					{actions.map((action) => (
						<EmptyTabActionButton
							key={action.id}
							display={action.display}
							icon={action.icon}
							label={action.label}
							onClick={action.onClick}
						/>
					))}
				</div>
				{(suggestionsLoading || seededChips.length > 0) && (
					<EmptyStateChips
						className="mt-6"
						chips={seededChips}
						chipsLoading={suggestionsLoading}
					/>
				)}
				{workspace && (
					<button
						type="button"
						className="mx-auto mt-6 flex items-center gap-1 text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
						onClick={handleDeleteClick}
					>
						<LuTrash2 className="size-3" />
						Delete workspace
					</button>
				)}
			</div>
			{workspace && (
				<DeleteWorkspaceDialog
					workspaceId={workspaceId}
					workspaceName={workspace.name}
					workspaceType={workspace.type}
					open={showDeleteDialog}
					onOpenChange={setShowDeleteDialog}
				/>
			)}
		</div>
	);
}
