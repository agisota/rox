import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
	useInternalNode,
} from "@rox/ui/ai-elements/flow";
import { branchColorForPort, branchToneForPort } from "@rox/workflow-core";

/**
 * A branch-aware pipeline edge. Colours the stroke by the source out-port tone
 * (success=emerald, failure=rose, neutral=primary) and renders a small pill
 * label for named branches (true/false, allowed/blocked, case…) so the canvas
 * reads which path an edge takes — the dify/sim "labelled, colour-coded edges"
 * language.
 *
 * `@rox/ui/ai-elements/edge` re-exports only a fixed animated edge, so this
 * branch edge imports the xyflow primitives directly (the pipeline canvas is the
 * only consumer that needs branch colouring).
 */
export function BranchEdge({
	id,
	source,
	target,
	sourceHandleId,
	markerEnd,
	selected,
	data,
}: EdgeProps) {
	const sourceNode = useInternalNode(source);
	const targetNode = useInternalNode(target);
	if (!(sourceNode && targetNode)) return null;

	const handleId =
		sourceHandleId ?? (typeof data?.branch === "string" ? data.branch : "out");
	const tone = branchToneForPort(handleId);
	const isNeutral = tone === "neutral";
	const stroke = isNeutral ? "var(--primary)" : branchColorForPort(handleId);

	// Bezier between the source's right edge and the target's left edge.
	const sourceX =
		sourceNode.internals.positionAbsolute.x + (sourceNode.measured.width ?? 0);
	const sourceY =
		sourceNode.internals.positionAbsolute.y +
		(sourceNode.measured.height ?? 0) / 2;
	const targetX = targetNode.internals.positionAbsolute.x;
	const targetY =
		targetNode.internals.positionAbsolute.y +
		(targetNode.measured.height ?? 0) / 2;

	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
	});

	// Only label non-default branch ports (a plain `out` needs no label).
	const label = typeof data?.label === "string" ? data.label : undefined;
	const showLabel = Boolean(label) && handleId !== "out";

	return (
		<>
			<BaseEdge
				id={id}
				path={edgePath}
				markerEnd={markerEnd}
				style={{
					stroke,
					strokeWidth: selected ? 2.5 : 1.75,
					opacity: selected ? 1 : 0.85,
				}}
			/>
			{showLabel && (
				<EdgeLabelRenderer>
					<div
						className="pointer-events-none absolute rounded-full border bg-card px-1.5 py-0.5 text-[10px] font-medium shadow-sm"
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
							color: stroke,
							borderColor: isNeutral ? "var(--border)" : stroke,
						}}
					>
						{label}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}
