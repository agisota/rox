import { BookOpenIcon, HistoryIcon, SettingsIcon } from "lucide-react";
import { LuLayers } from "react-icons/lu";
import type { Command, CommandProvider } from "../../core/types";
import { RecentlyViewedFrame } from "../../ui/RecentlyViewed/RecentlyViewedFrame";
import { WorkspaceListFrame } from "../../ui/WorkspaceList";
import { settingsTabCommands } from "../settings/commands";

export const navigationProvider: CommandProvider = {
	id: "navigation",
	provide: () => {
		const commands: Command[] = [
			{
				id: "nav.settings",
				title: "Настройки",
				section: "navigation",
				icon: SettingsIcon,
				hotkeyId: "OPEN_SETTINGS",
				children: settingsTabCommands,
				run: (ctx) => ctx.navigate("/settings/account"),
			},
			{
				id: "nav.recentlyViewed",
				title: "Недавно просмотренные",
				section: "navigation",
				icon: HistoryIcon,
				keywords: ["история", "недавние", "назад"],
				renderFrame: () => <RecentlyViewedFrame />,
			},
			{
				id: "nav.workspaces",
				title: "Рабочие области",
				section: "navigation",
				icon: LuLayers,
				keywords: [
					"рабочая область",
					"проект",
					"repo",
					"repository",
					"перейти",
				],
				renderFrame: () => <WorkspaceListFrame />,
			},
			{
				id: "nav.docs",
				title: "Открыть документацию",
				section: "navigation",
				icon: BookOpenIcon,
				run: () => {
					window.open("https://docs.rox.one", "_blank", "noreferrer");
				},
			},
		];

		return commands;
	},
};
