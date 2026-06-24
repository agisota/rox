/**
 * Lucide icon lookup for the registry's `render.icon` strings. The registry is
 * pure (it names icons as strings); the canvas resolves them to components here.
 * Every node module's `render.icon` must appear in this map; an unknown name
 * falls back to {@link Box} so a future/typo'd icon still renders a node instead
 * of throwing.
 */

import {
	Bell,
	Binary,
	BookOpen,
	Bot,
	Box,
	Braces,
	Clock,
	Code,
	Database,
	DatabaseZap,
	FileJson,
	Flag,
	FormInput,
	GitFork,
	GitMerge,
	Globe,
	type LucideIcon,
	Play,
	Plug,
	Repeat,
	Search,
	ShieldCheck,
	ShieldHalf,
	Shuffle,
	Sparkles,
	Split,
	Tags,
	Variable,
	Webhook,
	Wrench,
} from "lucide-react";

/** Maps a registry `render.icon` name to its Lucide component. */
export const NODE_ICONS: Record<string, LucideIcon> = {
	Bell,
	Binary,
	BookOpen,
	Bot,
	Braces,
	Clock,
	Code,
	Database,
	DatabaseZap,
	FileJson,
	Flag,
	FormInput,
	GitFork,
	GitMerge,
	Globe,
	Play,
	Plug,
	Repeat,
	Search,
	ShieldCheck,
	ShieldHalf,
	Shuffle,
	Sparkles,
	Split,
	Tags,
	Variable,
	Webhook,
	Wrench,
};

/** Resolve a registry icon name to a component (Box fallback). */
export function resolveNodeIcon(name: string | undefined): LucideIcon {
	if (!name) return Box;
	return NODE_ICONS[name] ?? Box;
}
