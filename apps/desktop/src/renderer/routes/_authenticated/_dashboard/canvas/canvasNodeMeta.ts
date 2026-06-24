import type { CanvasNode } from "@rox/shared/canvas";
import {
	Bot,
	Boxes,
	Code,
	FileText,
	Image as ImageIcon,
	Link as LinkIcon,
	ListTodo,
	type LucideIcon,
	MessageSquare,
	Sparkles,
	StickyNote,
	Terminal,
	Type,
} from "lucide-react";

export type CanvasNodeType = CanvasNode["type"];

export interface CanvasNodeMeta {
	/** Russian label shown in the node type badge. */
	label: string;
	/** Lucide glyph rendered in the node header. */
	icon: LucideIcon;
	/**
	 * Category accent applied as a 4px left border on the glass card. Uses
	 * CSS custom-property color tokens so it tracks the active theme instead of
	 * the old hard-coded slate/sky palette.
	 */
	accent: string;
}

/**
 * Brand-aligned node descriptor map. Every `CanvasNode["type"]` from
 * `@rox/shared/canvas` is covered (enforced by `canvasNodeMeta.test.ts`) so the
 * renderer never falls back to an unstyled card. Accent colours are terracotta-
 * adjacent, neutral hues that read on the dark `--card` surface.
 */
const CANVAS_NODE_META: Record<CanvasNodeType, CanvasNodeMeta> = {
	text: { label: "Текст", icon: Type, accent: "var(--muted-foreground)" },
	note: { label: "Заметка", icon: StickyNote, accent: "#d9a441" },
	"chat-session": { label: "Сессия", icon: Bot, accent: "#e07850" },
	message: { label: "Сообщение", icon: MessageSquare, accent: "#7aa2f7" },
	artifact: { label: "Артефакт", icon: Sparkles, accent: "#b48ead" },
	file: { label: "Файл", icon: FileText, accent: "#88c0a3" },
	url: { label: "Ссылка", icon: LinkIcon, accent: "#5fb3c4" },
	image: { label: "Изображение", icon: ImageIcon, accent: "#88c0a3" },
	pdf: { label: "PDF", icon: FileText, accent: "#88c0a3" },
	code: { label: "Код", icon: Code, accent: "#88c0a3" },
	task: { label: "Задача", icon: ListTodo, accent: "#c97a5a" },
	prompt: { label: "Промпт", icon: Sparkles, accent: "#d9a441" },
	"tool-call": { label: "Инструмент", icon: Terminal, accent: "#c97a5a" },
	canvas: { label: "Холст", icon: Boxes, accent: "#e07850" },
};

const FALLBACK_NODE_META: CanvasNodeMeta = {
	label: "Узел",
	icon: Type,
	accent: "var(--muted-foreground)",
};

export function getCanvasNodeMeta(type: CanvasNodeType): CanvasNodeMeta {
	return CANVAS_NODE_META[type] ?? FALLBACK_NODE_META;
}

export function getCanvasNodeTypeLabel(type: CanvasNodeType): string {
	return getCanvasNodeMeta(type).label;
}

export const canvasNodeTypes = Object.keys(
	CANVAS_NODE_META,
) as CanvasNodeType[];
