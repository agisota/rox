import { toast } from "@rox/ui/sonner";
import {
	BellIcon,
	BellOffIcon,
	KeyboardIcon,
	PaletteIcon,
	PanelLeftIcon,
	PanelRightIcon,
	RefreshCwIcon,
} from "lucide-react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useRightSidebarToggleIntent } from "renderer/stores/right-sidebar-toggle-intent";
import { SYSTEM_THEME_ID, useThemeStore } from "renderer/stores/theme/store";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import type { Command, CommandProvider } from "../../core/types";
import { ThemeFrame } from "../../ui/ThemeFrame/ThemeFrame";

function cycleTheme(): void {
	const current = useThemeStore.getState().activeThemeId;
	const next =
		current === "light"
			? "dark"
			: current === "dark"
				? SYSTEM_THEME_ID
				: "light";
	useThemeStore.getState().setTheme(next);
}

async function toggleNotificationSoundsMuted(
	currentlyMuted: boolean,
): Promise<void> {
	await electronTrpcClient.settings.setNotificationSoundsMuted.mutate({
		muted: !currentlyMuted,
	});
	await electronQueryClient.invalidateQueries({
		queryKey: [["settings", "getNotificationSoundsMuted"]],
	});
}

export const actionsProvider: CommandProvider = {
	id: "actions",
	provide: (context) => {
		const commands: Command[] = [
			{
				id: "actions.toggleTheme",
				title: "Переключить тему",
				section: "actions",
				icon: PaletteIcon,
				keywords: ["темная", "светлая", "оформление", "цвет"],
				run: () => cycleTheme(),
				renderFrame: () => <ThemeFrame />,
			},
			{
				id: "actions.toggleLeftSidebar",
				title: "Переключить левую боковую панель",
				section: "actions",
				icon: PanelLeftIcon,
				hotkeyId: "TOGGLE_WORKSPACE_SIDEBAR",
				run: () => useWorkspaceSidebarStore.getState().toggleOpen(),
			},
		];

		if (context.workspace) {
			commands.push({
				id: "actions.toggleRightSidebar",
				title: "Переключить правую боковую панель",
				section: "actions",
				icon: PanelRightIcon,
				hotkeyId: "TOGGLE_SIDEBAR",
				run: () => useRightSidebarToggleIntent.getState().request(),
			});
		}

		commands.push(
			{
				id: "actions.toggleNotificationSounds",
				title: context.notificationSoundsMuted
					? "Включить звуки уведомлений"
					: "Отключить звуки уведомлений",
				section: "actions",
				icon: context.notificationSoundsMuted ? BellIcon : BellOffIcon,
				keywords: ["не беспокоить", "тишина", "уведомления", "звук"],
				run: () =>
					toggleNotificationSoundsMuted(context.notificationSoundsMuted),
			},
			{
				id: "actions.showShortcuts",
				title: "Показать сочетания клавиш",
				section: "actions",
				icon: KeyboardIcon,
				hotkeyId: "SHOW_HOTKEYS",
				keywords: ["горячие клавиши"],
				run: (ctx) => ctx.navigate("/settings/keyboard"),
			},
			{
				id: "actions.checkUpdates",
				title: "Проверить обновления",
				section: "actions",
				icon: RefreshCwIcon,
				keywords: ["обновление", "версия"],
				run: async () => {
					try {
						await electronTrpcClient.autoUpdate.checkInteractive.mutate();
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						toast.error(`Не удалось проверить обновления: ${message}`);
					}
				},
			},
		);

		return commands;
	},
};
