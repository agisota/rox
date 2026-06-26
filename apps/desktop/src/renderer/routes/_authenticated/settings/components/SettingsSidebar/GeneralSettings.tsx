import { motionSpring, useShouldAnimate } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { SettingsSection } from "renderer/stores/settings-state";
import { getAllowedSectionsForVariant } from "../../utils/settings-search";
import {
	SETTINGS_GROUP_ORDER,
	SETTINGS_MANIFEST,
	type SettingsGroupLabel,
	type SettingsManifestEntry,
} from "./settings-manifest";
import { SETTINGS_SECTION_ICONS } from "./settings-manifest-icons";

interface GeneralSettingsProps {
	matchCounts: Partial<Record<SettingsSection, number>> | null;
}

interface SectionGroup {
	label: SettingsGroupLabel;
	items: SettingsManifestEntry[];
}

/**
 * Sidebar nav groups derived from the shared {@link SETTINGS_MANIFEST}. The
 * sidebar, the route map (`layout.tsx`) and the search registry all consume the
 * same manifest, so nav/route/search can no longer drift (see #591).
 */
const SECTION_GROUPS: SectionGroup[] = SETTINGS_GROUP_ORDER.map((label) => ({
	label,
	items: SETTINGS_MANIFEST.filter((entry) => entry.group === label),
}));

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
							{filteredItems.map((item) => {
								const to = `/settings/${item.slug}`;
								const isActive = !!matchRoute({
									to,
									fuzzy: true,
								});
								const count = matchCounts?.[item.section];

								return (
									<Link
										key={item.section}
										to={to}
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
										{SETTINGS_SECTION_ICONS[item.section]}
										<span className="flex-1">{item.label}</span>
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
