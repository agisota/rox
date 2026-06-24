import type { ExternalApp } from "@rox/local-db";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { OverflowFadeText } from "@rox/ui/overflow-fade-text";
import { toast } from "@rox/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { motion, useAnimationControls } from "framer-motion";
import { useCallback, useMemo } from "react";
import { HiChevronDown } from "react-icons/hi2";
import {
	getAppOption,
	OpenInExternalDropdownItems,
} from "renderer/components/OpenInExternalDropdown";
import { HotkeyLabel, useHotkey, useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useV2ProjectDefaultApp } from "renderer/routes/_authenticated/hooks/useV2ProjectDefaultApp";
import { useThemeStore } from "renderer/stores";

interface V2OpenInMenuButtonProps {
	worktreePath: string;
	branch: string;
	projectId: string;
}

export function V2OpenInMenuButton({
	worktreePath,
	branch,
	projectId,
}: V2OpenInMenuButtonProps) {
	const activeTheme = useThemeStore((state) => state.activeTheme);
	const shouldAnimate = useShouldAnimate("decorative");
	const iconControls = useAnimationControls();

	const { app: persistedApp, setApp: persistDefaultApp } =
		useV2ProjectDefaultApp(projectId);
	const resolvedApp: ExternalApp = persistedApp ?? "finder";

	const openInApp = electronTrpc.external.openInApp.useMutation({
		onSuccess: (_data, variables) => {
			persistDefaultApp(variables.app);
			toast.success(
				`Opening in ${getAppOption(variables.app)?.label ?? "editor"}…`,
			);
		},
		onError: (error) => toast.error(`Failed to open: ${error.message}`),
	});
	const copyPath = electronTrpc.external.copyPath.useMutation({
		onSuccess: () => toast.success("Path copied to clipboard"),
		onError: (error) => toast.error(`Failed to copy path: ${error.message}`),
	});

	const currentApp = useMemo(
		() => getAppOption(resolvedApp) ?? null,
		[resolvedApp],
	);
	const openInDisplay = useHotkeyDisplay("OPEN_IN_APP");
	const copyPathDisplay = useHotkeyDisplay("COPY_PATH");
	const showOpenInShortcut = openInDisplay.text !== "Unassigned";
	const showCopyPathShortcut = copyPathDisplay.text !== "Unassigned";
	const isLoading = openInApp.isPending || copyPath.isPending;
	const isDark = activeTheme?.type === "dark";

	const handleOpenInEditor = useCallback(() => {
		if (openInApp.isPending || copyPath.isPending) return;
		openInApp.mutate({ path: worktreePath, app: resolvedApp });
		if (shouldAnimate) {
			iconControls.start({
				x: [0, 3, 0],
				y: [0, -2, 0],
				scale: [1, 1.12, 1],
				transition: {
					duration: motionDuration.slow,
					times: [0, 0.5, 1],
					ease: ease.standard,
				},
			});
		}
	}, [
		worktreePath,
		resolvedApp,
		openInApp,
		copyPath.isPending,
		shouldAnimate,
		iconControls,
	]);

	const handleOpenInOtherApp = useCallback(
		(appId: ExternalApp) => {
			if (openInApp.isPending || copyPath.isPending) return;
			openInApp.mutate({ path: worktreePath, app: appId });
		},
		[worktreePath, openInApp, copyPath.isPending],
	);

	const handleCopyPath = useCallback(() => {
		if (openInApp.isPending || copyPath.isPending) return;
		copyPath.mutate(worktreePath);
	}, [worktreePath, copyPath, openInApp.isPending]);

	useHotkey("OPEN_IN_APP", handleOpenInEditor);

	return (
		<div className="flex items-center no-drag">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleOpenInEditor}
						disabled={isLoading || !currentApp}
						aria-label={
							currentApp
								? `Open in ${currentApp.displayLabel ?? currentApp.label}`
								: "Open in editor"
						}
						className={cn(
							"group flex items-center gap-1.5 h-6 px-1.5 sm:pl-1.5 sm:pr-2 rounded-l border border-r-0 border-border/60 bg-secondary/50 text-xs font-medium",
							"transition-all duration-150 ease-out",
							"hover:bg-secondary hover:border-border",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							"active:scale-[0.98]",
							isLoading && "opacity-50 pointer-events-none",
						)}
					>
						{currentApp && (
							<motion.img
								animate={iconControls}
								src={isDark ? currentApp.darkIcon : currentApp.lightIcon}
								alt=""
								className="size-3.5 object-contain shrink-0"
							/>
						)}
						{branch && (
							<OverflowFadeText
								className="hidden lg:inline-block max-w-[140px] text-muted-foreground tabular-nums"
								title={branch}
							>
								/{branch}
							</OverflowFadeText>
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6}>
					{currentApp ? (
						<HotkeyLabel
							label={`Open in ${currentApp.displayLabel ?? currentApp.label}`}
							id="OPEN_IN_APP"
						/>
					) : (
						"Select an editor from the dropdown"
					)}
				</TooltipContent>
			</Tooltip>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={isLoading}
						className={cn(
							"flex items-center justify-center h-6 w-6 rounded-r border border-border/60 bg-secondary/50 text-muted-foreground",
							"transition-all duration-150 ease-out",
							"hover:bg-secondary hover:border-border hover:text-foreground",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							"active:scale-[0.98]",
							isLoading && "opacity-50 pointer-events-none",
						)}
					>
						<HiChevronDown className="size-3.5" />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-56">
					<OpenInExternalDropdownItems
						isDark={isDark}
						activeApp={resolvedApp}
						onOpenIn={handleOpenInOtherApp}
						onCopyPath={handleCopyPath}
						renderAppTrailing={(appId, group) => {
							if (
								appId !== resolvedApp ||
								!showOpenInShortcut ||
								group === "jetbrains"
							) {
								return null;
							}
							return (
								<DropdownMenuShortcut>
									{openInDisplay.text}
								</DropdownMenuShortcut>
							);
						}}
						copyPathTrailing={
							showCopyPathShortcut ? (
								<DropdownMenuShortcut>
									{copyPathDisplay.text}
								</DropdownMenuShortcut>
							) : null
						}
						subContentClassName="w-40"
						appContentClassName="gap-0"
						appIconClassName="size-4 object-contain mr-2"
						subTriggerIconClassName="size-4 object-contain mr-2"
						subTriggerContentClassName="flex items-center gap-0"
						copyPathContentClassName="gap-0"
						copyPathIconClassName="mr-2"
					/>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
