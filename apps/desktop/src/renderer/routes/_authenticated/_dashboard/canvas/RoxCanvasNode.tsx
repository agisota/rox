import { cn } from "@rox/ui/utils";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { motion } from "framer-motion";
import { ArrowUpRight, Lock } from "lucide-react";
import type { RoxFlowNode } from "./canvasFlowAdapter";
import { getCanvasNodeMeta } from "./canvasNodeMeta";
import { RefNodePreview } from "./RefNodePreview";

const HANDLE_CLASS =
	"!size-2.5 !rounded-full !border-[1.5px] !border-background !bg-[var(--sidebar-primary)]";

/**
 * Brand-aligned canvas node. Replaces the old slate/sky tinted card with a
 * neutral `--card` glass surface, a 4px category accent rail, Victor-Mono
 * chips, a lucide type glyph, a live ref preview, and locked/collapsed states.
 * Appearance is animated through framer-motion (fade + scale per spec).
 */
export function RoxCanvasNode({ data, selected }: NodeProps<RoxFlowNode>) {
	const meta = getCanvasNodeMeta(data.nodeType);
	const Icon = meta.icon;
	const isRef = Boolean(data.refType);
	const isFreeform = data.nodeType === "freeform" && Boolean(data.freeformPath);

	if (isFreeform && data.freeformPath && data.freeformViewBox) {
		return (
			<motion.div
				initial={{ opacity: 0, scale: 0.96 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.96 }}
				transition={{ duration: 0.18, ease: "easeOut" }}
				className={cn(
					"group relative h-full w-full",
					selected &&
						"rounded-md shadow-[0_0_0_2px_var(--sidebar-primary)] outline-none",
				)}
				data-canvas-node-id={data.canvasNodeId}
				data-testid="canvas-flow-node"
				data-node-type="freeform"
			>
				<NodeResizer
					color="var(--sidebar-primary)"
					isVisible={selected && !data.locked}
					keepAspectRatio
					minHeight={24}
					minWidth={24}
				/>
				<svg
					className="pointer-events-none h-full w-full"
					viewBox={`0 0 ${data.freeformViewBox.width} ${data.freeformViewBox.height}`}
					preserveAspectRatio="none"
					role="img"
					aria-label="Рисунок на холсте"
				>
					<title>Рисунок на холсте</title>
					<path
						d={data.freeformPath}
						fill={data.freeformColor ?? "var(--sidebar-primary)"}
					/>
				</svg>
			</motion.div>
		);
	}

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.96 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.96 }}
			transition={{ duration: 0.18, ease: "easeOut" }}
			className={cn(
				"glass-panel group relative flex h-full flex-col overflow-hidden rounded-lg border border-border/60",
				"transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5",
				selected &&
					"border-[var(--sidebar-primary)]/70 shadow-[0_0_0_2px_var(--sidebar-primary),0_0_24px_-4px_var(--sidebar-primary)]",
			)}
			style={{ borderLeft: `4px solid ${meta.accent}` }}
			data-canvas-node-id={data.canvasNodeId}
			data-testid="canvas-flow-node"
		>
			<NodeResizer
				color="var(--sidebar-primary)"
				isVisible={selected && !data.locked}
				minHeight={data.collapsed ? 48 : 96}
				minWidth={180}
			/>
			<Handle className={HANDLE_CLASS} position={Position.Left} type="target" />
			<Handle
				className={HANDLE_CLASS}
				position={Position.Right}
				type="source"
			/>

			<div className="flex items-center justify-between gap-2 px-3 pt-2.5">
				<span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
					<Icon className="size-3" style={{ color: meta.accent }} />
					{meta.label}
				</span>
				<div className="flex items-center gap-1">
					{data.locked ? (
						<Lock className="size-3 text-muted-foreground" />
					) : null}
					<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70">
						{data.canvasNodeId.slice(0, 6)}
					</span>
				</div>
			</div>

			{data.collapsed ? (
				<div className="truncate px-3 pb-2.5 font-mono text-foreground text-sm">
					{data.title}
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col px-3 pt-2 pb-2.5">
					<h3 className="line-clamp-2 font-mono font-semibold text-foreground text-sm leading-snug">
						{data.title}
					</h3>
					{isRef ? (
						<div className="mt-1.5 min-h-0 flex-1">
							<RefNodePreview data={data} />
						</div>
					) : data.body ? (
						<p className="mt-1.5 line-clamp-3 text-muted-foreground text-xs leading-relaxed">
							{data.body}
						</p>
					) : null}
					<div className="mt-auto flex items-center justify-between gap-2 pt-2">
						<span className="truncate font-mono text-[10px] text-muted-foreground/70">
							{data.refLabel ?? "узел документа"}
						</span>
						{data.tags.length > 0 ? (
							<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
								#{data.tags[0]}
							</span>
						) : null}
					</div>
				</div>
			)}

			{isRef ? (
				<div
					className="pointer-events-none absolute top-2 right-2 flex size-6 items-center justify-center rounded-md border border-border/60 bg-card/80 opacity-0 transition-opacity group-hover:opacity-100"
					title="Двойной клик — открыть связанную сущность"
				>
					<ArrowUpRight className="size-3.5 text-[var(--sidebar-primary)]" />
				</div>
			) : null}
		</motion.div>
	);
}

export const canvasNodeTypes = { roxCanvasNode: RoxCanvasNode };
