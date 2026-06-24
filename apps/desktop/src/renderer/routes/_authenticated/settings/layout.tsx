import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import {
	createFileRoute,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type SettingsSection,
	useSetSettingsSearchQuery,
	useSettingsOriginRoute,
	useSettingsSearchQuery,
} from "renderer/stores/settings-state";
import { NavigationControls } from "../_dashboard/components/NavigationControls";
import { SearchResultsBanner } from "./components/SearchResultsBanner";
import { SettingsSidebar } from "./components/SettingsSidebar";
import {
	getMatchCountBySection,
	searchSettings,
} from "./utils/settings-search";

export const Route = createFileRoute("/_authenticated/settings")({
	component: SettingsLayout,
});

/**
 * Single source of truth for section ⇆ route mapping (Settings P0 hardening).
 *
 * Previously `SECTION_ORDER`, `getSectionFromPath` and `getPathFromSection`
 * were three hand-maintained lists that drifted: ringtones, voice, shares,
 * links, security, agents, api-keys, teams and integrations were missing from
 * one or more of them, so search auto-navigation could not land on those
 * sections and the path maps disagreed with the sidebar. They are now derived
 * from this one ordered manifest, whose order + membership matches the sidebar
 * nav groups (`GeneralSettings`) and the search registry (`SettingsSection`).
 *
 * `slug` is the URL segment under `/settings/`; `match` (optional) lists extra
 * pathname fragments that should resolve to this section (e.g. the `api-keys`
 * route maps to the `apikeys` registry section).
 */
interface SettingsSectionRoute {
	section: SettingsSection;
	slug: string;
	match?: string[];
}

const SETTINGS_SECTION_ROUTES: SettingsSectionRoute[] = [
	// Личное
	{ section: "account", slug: "account" },
	{ section: "appearance", slug: "appearance" },
	{ section: "ringtones", slug: "ringtones" },
	// Редактор и процесс
	{ section: "behavior", slug: "behavior" },
	{ section: "keyboard", slug: "keyboard" },
	{ section: "voice", slug: "voice" },
	{ section: "git", slug: "git" },
	{ section: "agents", slug: "agents" },
	{ section: "terminal", slug: "terminal" },
	{ section: "links", slug: "links" },
	{ section: "shares", slug: "shares" },
	{ section: "models", slug: "models" },
	// Организация
	{ section: "organization", slug: "organization" },
	{ section: "teams", slug: "teams" },
	{ section: "project", slug: "projects", match: ["/settings/project"] },
	{ section: "hosts", slug: "hosts" },
	{ section: "integrations", slug: "integrations" },
	{ section: "apikeys", slug: "api-keys" },
	// Система
	{ section: "security", slug: "security" },
	{ section: "permissions", slug: "permissions" },
	{ section: "experimental", slug: "experimental" },
];

const SECTION_ORDER: SettingsSection[] = SETTINGS_SECTION_ROUTES.map(
	(entry) => entry.section,
);

function getSectionFromPath(pathname: string): SettingsSection | null {
	for (const entry of SETTINGS_SECTION_ROUTES) {
		if (pathname.includes(`/settings/${entry.slug}`)) return entry.section;
		if (entry.match?.some((fragment) => pathname.includes(fragment))) {
			return entry.section;
		}
	}
	return null;
}

function getPathFromSection(section: SettingsSection): string {
	const entry = SETTINGS_SECTION_ROUTES.find((e) => e.section === section);
	return entry ? `/settings/${entry.slug}` : "/settings/account";
}

function SettingsLayout() {
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const searchQuery = useSettingsSearchQuery();
	const setSearchQuery = useSetSettingsSearchQuery();
	const originRoute = useSettingsOriginRoute();
	const location = useLocation();
	const navigate = useNavigate();
	const normalizedSearchQuery = searchQuery.trim();
	const isSearchActive = normalizedSearchQuery.length > 0;
	const totalMatches = isSearchActive
		? searchSettings(normalizedSearchQuery).length
		: 0;

	useEffect(() => {
		if (!isSearchActive) return;

		const currentSection = getSectionFromPath(location.pathname);
		if (!currentSection) return;

		if (currentSection === "project") return;
		if (currentSection === "hosts") return;

		const matchCounts = getMatchCountBySection(normalizedSearchQuery);
		const currentHasMatches = (matchCounts[currentSection] ?? 0) > 0;

		if (!currentHasMatches) {
			const firstMatch = SECTION_ORDER.find(
				(section) => (matchCounts[section] ?? 0) > 0,
			);
			if (firstMatch) {
				navigate({ to: getPathFromSection(firstMatch), replace: true });
			}
		}
	}, [isSearchActive, location.pathname, navigate, normalizedSearchQuery]);

	useHotkeys(
		"escape",
		(event) => {
			if (document.querySelector('[data-state="open"]')) return;
			const segments = location.pathname.split("/").filter(Boolean);
			event.preventDefault();
			if (segments.length <= 2) {
				navigate({ to: originRoute });
				return;
			}

			const parent = `/${segments.slice(0, -1).join("/")}`;
			navigate({ to: parent });
		},
		{ enableOnFormTags: false, enableOnContentEditable: false },
		[navigate, location.pathname, originRoute],
	);

	const shouldAnimate = useShouldAnimate("decorative");
	const section: string =
		getSectionFromPath(location.pathname) ?? location.pathname;

	const usesInnerSidebar =
		location.pathname.startsWith("/settings/projects") ||
		location.pathname.startsWith("/settings/hosts") ||
		location.pathname.startsWith("/settings/agents");

	return (
		<div className="flex flex-col h-screen w-screen bg-tertiary">
			<div
				className="drag flex h-12 w-full items-center gap-1.5 bg-tertiary"
				style={{
					paddingLeft: isMac ? "96px" : "8px",
				}}
			>
				<NavigationControls />
			</div>

			<div className="flex flex-1 overflow-hidden">
				<SettingsSidebar />
				<div className="flex-1 m-3 bg-background rounded overflow-auto">
					{isSearchActive && (
						<SearchResultsBanner
							query={normalizedSearchQuery}
							matchCount={totalMatches}
							onClear={() => setSearchQuery("")}
						/>
					)}
					<AnimatePresence mode="wait" initial={false}>
						{shouldAnimate ? (
							<motion.div
								key={section}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{
									duration: motionDuration.fast,
									ease: ease.standard,
								}}
							>
								{usesInnerSidebar ? (
									<Outlet />
								) : (
									<div className="mx-auto w-full max-w-7xl">
										<Outlet />
									</div>
								)}
							</motion.div>
						) : usesInnerSidebar ? (
							<Outlet />
						) : (
							<div className="mx-auto w-full max-w-7xl">
								<Outlet />
							</div>
						)}
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}
