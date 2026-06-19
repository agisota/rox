/**
 * Single source of truth for the macOS Automation (Apple Events) targets that
 * Rox can request control of. Consumed by the main-process automation service,
 * the permissions tRPC router, and (via the router output) the renderer UI.
 *
 * macOS adds a "Rox → <Target>" row to System Settings ▸ Privacy & Security ▸
 * Automation **lazily** — only the first time Rox actually sends an Apple Event
 * to that specific target. So to make Rox appear (and be grantable) for each app
 * below, we must send a benign Apple Event to each one. There is no API to
 * pre-populate the pane.
 *
 * NOTE: `bash` / shell execution is intentionally NOT listed. Running shell
 * commands is not gated by the Apple Events TCC service (kTCCServiceAppleEvents)
 * and never appears in the Automation pane — it is reached via Terminal
 * automation or a direct child process. Listing it would be a category error.
 */
export interface AutomationTarget {
	/** Stable id for React keys, tests, and tRPC input validation. */
	id: string;
	/** macOS bundle identifier the Apple Event is addressed to. */
	bundleId: string;
	/** Human label shown in the UI. */
	label: string;
}

export const AUTOMATION_TARGETS = [
	{
		id: "system-events",
		bundleId: "com.apple.systemevents",
		label: "System Events",
	},
	{ id: "finder", bundleId: "com.apple.finder", label: "Finder" },
	{
		id: "shortcuts",
		bundleId: "com.apple.shortcuts.events",
		label: "Команды (Shortcuts)",
	},
	{ id: "chrome", bundleId: "com.google.Chrome", label: "Google Chrome" },
	{ id: "terminal", bundleId: "com.apple.Terminal", label: "Terminal" },
	{ id: "preview", bundleId: "com.apple.Preview", label: "Просмотр (Preview)" },
	{ id: "obsidian", bundleId: "md.obsidian", label: "Obsidian" },
	// PyCharm's bundle id varies by edition; Community Edition is the safe default.
	{
		id: "pycharm",
		bundleId: "com.jetbrains.pycharm.ce",
		label: "PyCharm",
	},
] as const satisfies readonly AutomationTarget[];

export type AutomationTargetId = (typeof AUTOMATION_TARGETS)[number]["id"];

const BUNDLE_IDS = new Set<string>(AUTOMATION_TARGETS.map((t) => t.bundleId));

/** True when the bundle id is one of our known automation targets. */
export function isKnownAutomationTarget(bundleId: string): boolean {
	return BUNDLE_IDS.has(bundleId);
}
