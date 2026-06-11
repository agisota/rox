import { cn } from "@rox/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo } from "react";
import {
	HiOutlineBeaker,
	HiOutlineBell,
	HiOutlineBuildingOffice2,
	HiOutlineCommandLine,
	HiOutlineComputerDesktop,
	HiOutlineCpuChip,
	HiOutlineCreditCard,
	HiOutlineFolder,
	HiOutlineKey,
	HiOutlineLink,
	HiOutlineLockClosed,
	HiOutlinePaintBrush,
	HiOutlinePuzzlePiece,
	HiOutlineShieldCheck,
	HiOutlineSparkles,
	HiOutlineUser,
	HiOutlineUserGroup,
} from "react-icons/hi2";
import { LuBrain, LuGitBranch, LuKeyboard } from "react-icons/lu";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { motionSpring, useShouldAnimate } from "renderer/motion";
import type { SettingsSection } from "renderer/stores/settings-state";
import { getAllowedSectionsForVariant } from "../../utils/settings-search";

interface GeneralSettingsProps {
	matchCounts: Partial<Record<SettingsSection, number>> | null;
}

type SettingsRoute =
	| "/settings/account"
	| "/settings/organization"
	| "/settings/teams"
	| "/settings/appearance"
	| "/settings/ringtones"
	| "/settings/keyboard"
	| "/settings/behavior"
	| "/settings/git"
	| "/settings/agents"
	| "/settings/terminal"
	| "/settings/links"
	| "/settings/models"
	| "/settings/experimental"
	| "/settings/integrations"
	| "/settings/billing"
	| "/settings/api-keys"
	| "/settings/security"
	| "/settings/permissions"
	| "/settings/projects"
	| "/settings/hosts";

interface SectionItem {
	id: SettingsRoute;
	section: SettingsSection;
	label: string;
	icon: React.ReactNode;
	macOnly?: boolean;
}

interface SectionGroup {
	label: string;
	items: SectionItem[];
}

const SECTION_GROUPS: SectionGroup[] = [
	{
		label: "Личное",
		items: [
			{
				id: "/settings/account",
				section: "account",
				label: "Аккаунт",
				icon: <HiOutlineUser className="h-4 w-4" />,
			},
			{
				id: "/settings/appearance",
				section: "appearance",
				label: "Внешний вид",
				icon: <HiOutlinePaintBrush className="h-4 w-4" />,
			},
			{
				id: "/settings/ringtones",
				section: "ringtones",
				label: "Уведомления",
				icon: <HiOutlineBell className="h-4 w-4" />,
			},
		],
	},
	{
		label: "Редактор и процесс",
		items: [
			{
				id: "/settings/behavior",
				section: "behavior",
				label: "Общие",
				icon: <HiOutlineSparkles className="h-4 w-4" />,
			},
			{
				id: "/settings/keyboard",
				section: "keyboard",
				label: "Клавиатура",
				icon: <LuKeyboard className="h-4 w-4" />,
			},
			{
				id: "/settings/git",
				section: "git",
				label: "Git и worktrees",
				icon: <LuGitBranch className="h-4 w-4" />,
			},
			{
				id: "/settings/agents",
				section: "agents",
				label: "Агенты",
				icon: <HiOutlineCpuChip className="h-4 w-4" />,
			},
			{
				id: "/settings/terminal",
				section: "terminal",
				label: "Терминал",
				icon: <HiOutlineCommandLine className="h-4 w-4" />,
			},
			{
				id: "/settings/links",
				section: "links",
				label: "Ссылки",
				icon: <HiOutlineLink className="h-4 w-4" />,
			},
			{
				id: "/settings/models",
				section: "models",
				label: "Модели",
				icon: <LuBrain className="h-4 w-4" />,
			},
		],
	},
	{
		label: "Организация",
		items: [
			{
				id: "/settings/organization",
				section: "organization",
				label: "Организация",
				icon: <HiOutlineBuildingOffice2 className="h-4 w-4" />,
			},
			{
				id: "/settings/teams",
				section: "teams",
				label: "Команды",
				icon: <HiOutlineUserGroup className="h-4 w-4" />,
			},
			{
				id: "/settings/projects",
				section: "project",
				label: "Проекты",
				icon: <HiOutlineFolder className="h-4 w-4" />,
			},
			{
				id: "/settings/hosts",
				section: "hosts",
				label: "Хосты",
				icon: <HiOutlineComputerDesktop className="h-4 w-4" />,
			},
			{
				id: "/settings/integrations",
				section: "integrations",
				label: "Интеграции",
				icon: <HiOutlinePuzzlePiece className="h-4 w-4" />,
			},
			{
				id: "/settings/billing",
				section: "billing",
				label: "Оплата",
				icon: <HiOutlineCreditCard className="h-4 w-4" />,
			},
			{
				id: "/settings/api-keys",
				section: "apikeys",
				label: "API-ключи",
				icon: <HiOutlineKey className="h-4 w-4" />,
			},
		],
	},
	{
		label: "Система",
		items: [
			{
				id: "/settings/security",
				section: "security",
				label: "Безопасность",
				icon: <HiOutlineLockClosed className="h-4 w-4" />,
			},
			{
				id: "/settings/permissions",
				section: "permissions",
				label: "Разрешения",
				icon: <HiOutlineShieldCheck className="h-4 w-4" />,
				macOnly: true,
			},
			{
				id: "/settings/experimental",
				section: "experimental",
				label: "Эксперименты",
				icon: <HiOutlineBeaker className="h-4 w-4" />,
			},
		],
	},
];

export function GeneralSettings({ matchCounts }: GeneralSettingsProps) {
	const matchRoute = useMatchRoute();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const allowedSections = useMemo(
		() => getAllowedSectionsForVariant(isV2CloudEnabled),
		[isV2CloudEnabled],
	);
	const shouldAnimate = useShouldAnimate("decorative");

	return (
		<>
			{SECTION_GROUPS.map((group, groupIndex) => {
				const platformItems = group.items.filter(
					(item) =>
						(!item.macOnly || isMac) && allowedSections.has(item.section),
				);
				const filteredItems = matchCounts
					? platformItems.filter((item) => (matchCounts[item.section] ?? 0) > 0)
					: platformItems;

				if (filteredItems.length === 0) return null;

				return (
					<div key={group.label} className={cn(groupIndex > 0 && "mt-4")}>
						<h2 className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-[0.1em] px-3 mb-1">
							{group.label}
						</h2>
						<nav className="flex flex-col">
							{filteredItems.map((section) => {
								const isActive = !!matchRoute({
									to: section.id,
									fuzzy: true,
								});
								const count = matchCounts?.[section.section];

								return (
									<Link
										key={section.id}
										to={section.id}
										className={cn(
											"relative flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors text-left",
											isActive
												? cn(
														"text-accent-foreground",
														!shouldAnimate && "bg-accent",
													)
												: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
										)}
									>
										{isActive && shouldAnimate && (
											<motion.div
												layoutId="settings-nav-active"
												className="absolute inset-0 -z-10 rounded-md bg-accent"
												transition={motionSpring.snappy}
											/>
										)}
										{section.icon}
										<span className="flex-1">{section.label}</span>
										{count !== undefined && count > 0 && (
											<span className="text-xs text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
												{count}
											</span>
										)}
									</Link>
								);
							})}
						</nav>
					</div>
				);
			})}
		</>
	);
}
