import type { CanvasNodeRef } from "@rox/shared/canvas";
import {
	type GitStatusTone,
	type RefNodePreview as RefNodePreviewModel,
	type TaskStatusTone,
	toRefNodePreview,
} from "@rox/shared/canvas";
import { cn } from "@rox/ui/utils";
import { workspaceTrpc } from "@rox/workspace-client";
import { useReducedMotion } from "framer-motion";
import { FileText, ImageOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import type { RoxCanvasNodeData } from "./canvasFlowAdapter";

/** Terracotta-aligned status-dot colors per task lifecycle tone. */
const TASK_TONE_COLOR: Record<TaskStatusTone, string> = {
	todo: "var(--muted-foreground)",
	"in-progress": "var(--sidebar-primary)",
	blocked: "#e0533d",
	done: "#3fb27f",
	cancelled: "var(--muted-foreground)",
	unknown: "var(--muted-foreground)",
};

const GIT_TONE_META: Record<GitStatusTone, { label: string; color: string }> = {
	modified: { label: "M", color: "#d9a441" },
	added: { label: "A", color: "#3fb27f" },
	deleted: { label: "D", color: "#e0533d" },
	renamed: { label: "R", color: "var(--sidebar-primary)" },
	untracked: { label: "?", color: "var(--muted-foreground)" },
	clean: { label: "·", color: "var(--muted-foreground)" },
};

/**
 * Observe an element and report when it first enters the viewport. Used to lazy
 * activate live ref-content queries only for nodes the user can actually see,
 * avoiding a query storm on large canvases.
 */
function useInViewport<T extends Element>(): [
	React.RefObject<T | null>,
	boolean,
] {
	const ref = useRef<T | null>(null);
	const [inView, setInView] = useState(false);
	useEffect(() => {
		const element = ref.current;
		if (!element || inView) return;
		if (typeof IntersectionObserver === "undefined") {
			setInView(true);
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setInView(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "120px" },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [inView]);
	return [ref, inView];
}

/**
 * Live mini-content for a canvas ref node (issue #581). Resolves type-specific
 * content (chat replies, note markdown, file + git status, image thumb, task
 * status dot) lazily and cache-first: the last-known `ref.preview` shows
 * immediately while live data loads in the background, with no skeleton storm.
 * Read-only over the ref — never mutates the `CanvasDocument`.
 */
export function RefNodePreview({ data }: { data: RoxCanvasNodeData }) {
	const [containerRef, inView] = useInViewport<HTMLDivElement>();
	const ref = data.nodeRef as CanvasNodeRef | undefined;

	const liveQuery = workspaceTrpc.canvas.resolveRefPreview.useQuery(
		{ workspaceId: data.workspaceId ?? "", ref: (ref ?? {}) as CanvasNodeRef },
		{
			enabled: inView && !!data.workspaceId && !!ref,
			staleTime: 15_000,
			retry: false,
		},
	);

	const preview = toRefNodePreview(
		{
			type: data.nodeType,
			title: data.title,
			text: data.nodeText,
			ref,
		},
		liveQuery.data,
	);

	return (
		<div ref={containerRef} className="min-h-0 flex-1">
			<RefPreviewBody preview={preview} fallback={data.body} />
		</div>
	);
}

function RefPreviewBody({
	preview,
	fallback,
}: {
	preview: RefNodePreviewModel;
	fallback?: string;
}) {
	const reducedMotion = useReducedMotion();

	switch (preview.kind) {
		case "chat":
			return (
				<div className="flex flex-col gap-1">
					{preview.replies.length > 0 ? (
						preview.replies.slice(-2).map((reply, index) => (
							<p
								// biome-ignore lint/suspicious/noArrayIndexKey: replies are an ordered, ephemeral preview slice
								key={index}
								className="line-clamp-2 text-muted-foreground text-xs leading-relaxed"
							>
								<span className="font-mono text-[10px] text-muted-foreground/70 uppercase">
									{reply.role}:{" "}
								</span>
								{reply.text}
							</p>
						))
					) : (
						<p className="line-clamp-3 text-muted-foreground text-xs leading-relaxed">
							{preview.status
								? `Статус сессии: ${preview.status}`
								: (fallback ?? "Сессия чата")}
						</p>
					)}
				</div>
			);
		case "note":
			return preview.markdown ? (
				<div className="pointer-events-none max-h-24 overflow-hidden text-xs">
					<MarkdownRenderer
						content={preview.markdown}
						className="!h-auto !overflow-hidden text-xs [&_*]:!text-xs"
					/>
				</div>
			) : (
				<p className="line-clamp-3 text-muted-foreground text-xs leading-relaxed">
					{fallback ?? "Пустая заметка"}
				</p>
			);
		case "file":
			return (
				<div className="flex items-center gap-2">
					<FileText className="size-3.5 shrink-0 text-muted-foreground" />
					<span className="truncate font-mono text-foreground text-xs">
						{preview.name}
					</span>
					{preview.gitStatus ? (
						<span
							className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
							style={{ color: GIT_TONE_META[preview.gitStatus].color }}
							title={`git: ${preview.gitStatus}`}
						>
							{GIT_TONE_META[preview.gitStatus].label}
						</span>
					) : null}
				</div>
			);
		case "image":
			return preview.src ? (
				<img
					src={preview.src}
					alt={preview.name}
					className={cn(
						"max-h-24 w-full rounded-md object-cover",
						!reducedMotion && "transition-opacity duration-200",
					)}
					draggable={false}
				/>
			) : (
				<div className="flex items-center gap-2 text-muted-foreground">
					<ImageOff className="size-3.5 shrink-0" />
					<span className="truncate font-mono text-xs">{preview.name}</span>
				</div>
			);
		case "task":
			return (
				<div className="flex items-center gap-2">
					<span
						className="size-2.5 shrink-0 rounded-full"
						style={{ backgroundColor: TASK_TONE_COLOR[preview.tone] }}
						title={preview.statusLabel ?? preview.tone}
					/>
					<span className="truncate text-foreground text-xs">
						{preview.title}
					</span>
				</div>
			);
		default:
			return preview.text || fallback ? (
				<p className="line-clamp-3 text-muted-foreground text-xs leading-relaxed">
					{preview.text ?? fallback}
				</p>
			) : null;
	}
}
