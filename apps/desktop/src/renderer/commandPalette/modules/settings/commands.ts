import {
	BeakerIcon,
	BellIcon,
	BookmarkIcon,
	BuildingIcon,
	CpuIcon,
	FileTextIcon,
	FolderIcon,
	GitBranchIcon,
	KeyboardIcon,
	KeyRoundIcon,
	LinkIcon,
	type LucideIcon,
	PaletteIcon,
	ServerIcon,
	ShieldIcon,
	SlidersIcon,
	TerminalIcon,
	UserIcon,
	UsersIcon,
	WrenchIcon,
} from "lucide-react";
import {
	getPathFromSection,
	SECTION_ORDER,
} from "renderer/routes/_authenticated/settings/components/SettingsSidebar/settings-manifest";
import { requestSettingsDeepLink } from "renderer/routes/_authenticated/settings/utils/settings-deeplink";
import { SETTINGS_ITEMS } from "renderer/routes/_authenticated/settings/utils/settings-search";
import type { Command, CommandProvider } from "../../core/types";

interface SettingsTab {
	id: string;
	title: string;
	path: string;
	icon: LucideIcon;
	keywords?: string[];
}

const TABS: SettingsTab[] = [
	{
		id: "account",
		title: "Аккаунт",
		path: "/settings/account",
		icon: UserIcon,
	},
	{
		id: "appearance",
		title: "Внешний вид",
		path: "/settings/appearance",
		icon: PaletteIcon,
		keywords: ["theme", "color"],
	},
	{
		id: "behavior",
		title: "Поведение",
		path: "/settings/behavior",
		icon: SlidersIcon,
	},
	{
		id: "models",
		title: "Модели",
		path: "/settings/models",
		icon: CpuIcon,
		keywords: ["ai", "llm"],
	},
	{
		id: "terminal",
		title: "Терминал",
		path: "/settings/terminal",
		icon: TerminalIcon,
	},
	{ id: "git", title: "Git", path: "/settings/git", icon: GitBranchIcon },
	{
		id: "experimental",
		title: "Эксперименты",
		path: "/settings/experimental",
		icon: BeakerIcon,
	},
	{
		id: "integrations",
		title: "Интеграции",
		path: "/settings/integrations",
		icon: LinkIcon,
	},
	{
		id: "organization",
		title: "Организация",
		path: "/settings/organization",
		icon: BuildingIcon,
	},
	{ id: "teams", title: "Команды", path: "/settings/teams", icon: UsersIcon },
	{
		id: "keyboard",
		title: "Горячие клавиши",
		path: "/settings/keyboard",
		icon: KeyboardIcon,
		keywords: ["hotkeys", "shortcuts"],
	},
	{ id: "links", title: "Ссылки", path: "/settings/links", icon: BookmarkIcon },
	{
		id: "permissions",
		title: "Разрешения",
		path: "/settings/permissions",
		icon: ShieldIcon,
	},
	{ id: "hosts", title: "Хосты", path: "/settings/hosts", icon: ServerIcon },
	{
		id: "projects",
		title: "Проекты",
		path: "/settings/projects",
		icon: FolderIcon,
	},
	{
		id: "ringtones",
		title: "Рингтоны",
		path: "/settings/ringtones",
		icon: BellIcon,
	},
	{
		id: "security",
		title: "Безопасность",
		path: "/settings/security",
		icon: KeyRoundIcon,
	},
	{ id: "agents", title: "Агенты", path: "/settings/agents", icon: WrenchIcon },
	{
		id: "presets",
		title: "Пресеты",
		path: "/settings/presets",
		icon: FileTextIcon,
	},
	{
		id: "api-keys",
		title: "API keys",
		path: "/settings/api-keys",
		icon: KeyRoundIcon,
		keywords: ["token"],
	},
];

function tabToCommand(tab: SettingsTab): Command {
	return {
		id: `settings.${tab.id}`,
		title: tab.title,
		section: "navigation",
		icon: tab.icon,
		keywords: tab.keywords,
		run: (ctx) => ctx.navigate(tab.path),
	};
}

export const settingsTabCommands = TABS.map(tabToCommand);

/**
 * Deep-link command per registry setting (#592): "Открыть настройку: <title>".
 *
 * Built over the unified settings registry (`SETTINGS_ITEMS`) so every item's
 * RU/EN keywords feed the palette fuzzy match. Running a command records the
 * deep-link target (so the destination page flashes the card on arrival) and
 * navigates to the owning section route. Sections are kept in manifest order so
 * the list reads top-to-bottom like the settings sidebar.
 */
function sectionRank(section: string): number {
	const index = SECTION_ORDER.indexOf(
		section as (typeof SECTION_ORDER)[number],
	);
	return index === -1 ? SECTION_ORDER.length : index;
}

export const settingsItemCommands: Command[] = [...SETTINGS_ITEMS]
	.sort((a, b) => sectionRank(a.section) - sectionRank(b.section))
	.map((item) => ({
		id: `settings.item.${item.id}`,
		title: `Открыть настройку: ${item.title}`,
		section: "navigation" as const,
		icon: SlidersIcon,
		keywords: [item.description, ...item.keywords],
		run: (ctx) => {
			requestSettingsDeepLink(item.id);
			ctx.navigate(getPathFromSection(item.section));
		},
	}));

export const settingsItemsProvider: CommandProvider = {
	id: "settings-items",
	provide: () => settingsItemCommands,
};
