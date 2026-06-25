import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * Persisted open/closed state for Automations list groups.
 *
 * The Automations table groups rows under a label/group header (by project) so
 * many automations sharing a group can be folded away. Each group is keyed by a
 * stable string (project id, or a sentinel for the "no project" bucket). Groups
 * default to expanded; only explicitly-collapsed groups are stored, so new
 * groups appear open without any migration.
 *
 * Persists locally via the same zustand `persist` middleware every other
 * local-pref store in this app uses (mirrors `v2-project-local-meta`).
 */
interface AutomationGroupCollapseState {
	/** Map of groupKey → `true` when the group is collapsed (folded). */
	collapsed: Record<string, boolean>;
	/** True when the group should render folded. Defaults to expanded. */
	isCollapsed: (groupKey: string) => boolean;
	/** Flip a single group's collapsed state. */
	toggle: (groupKey: string) => void;
	/** Explicitly set a group's collapsed state. */
	setCollapsed: (groupKey: string, collapsed: boolean) => void;
}

export const useAutomationGroupCollapseStore =
	create<AutomationGroupCollapseState>()(
		devtools(
			persist(
				(set, get) => ({
					collapsed: {},

					isCollapsed: (groupKey) => get().collapsed[groupKey] === true,

					toggle: (groupKey) => {
						set((state) => ({
							collapsed: {
								...state.collapsed,
								[groupKey]: !state.collapsed[groupKey],
							},
						}));
					},

					setCollapsed: (groupKey, collapsed) => {
						set((state) => ({
							collapsed: { ...state.collapsed, [groupKey]: collapsed },
						}));
					},
				}),
				{
					name: "automation-group-collapse",
					version: 1,
				},
			),
			{ name: "AutomationGroupCollapseStore" },
		),
	);
