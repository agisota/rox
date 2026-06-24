import type { ComponentType } from "react";
import {
	LuAtSign,
	LuBot,
	LuGitPullRequest,
	LuMail,
	LuMessageSquare,
	LuZap,
} from "react-icons/lu";
import type { NotificationKind } from "renderer/stores/notification-feed";

/** Per-kind icon + accent for a feed row. */
export interface KindVisual {
	Icon: ComponentType<{ className?: string }>;
	/** Tailwind text-color class for the icon (glass-tinted accents). */
	tint: string;
}

/**
 * Icon + accent per notification kind. Centralized so the panel rows stay
 * visually consistent and a new kind only needs one edit here. Icons are from
 * `react-icons/lu` (the surface's dominant Lucide set).
 */
export const KIND_VISUAL: Record<NotificationKind, KindVisual> = {
	mail: { Icon: LuMail, tint: "text-sky-400" },
	chat: { Icon: LuMessageSquare, tint: "text-violet-400" },
	mention: { Icon: LuAtSign, tint: "text-amber-400" },
	agent: { Icon: LuBot, tint: "text-emerald-400" },
	automation: { Icon: LuZap, tint: "text-yellow-400" },
	"pr-review": { Icon: LuGitPullRequest, tint: "text-orange-400" },
};
