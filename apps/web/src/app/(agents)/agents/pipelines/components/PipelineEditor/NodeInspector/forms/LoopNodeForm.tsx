"use client";

import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { useState } from "react";
import { clampMaxIterations } from "../nodePatch";
import type { NodeFormProps } from "./types";

/**
 * Loop node config. Edits `subBlocks.maxIterations` (integer 1..200) for display;
 * blank clears the key so the node falls back to "Повтор тела цикла". Loop-body
 * membership lives in `RoxWorkflowState.loops[].nodes` and is NOT edited here (v1).
 */
export function LoopNodeForm({ node, patch }: NodeFormProps) {
	const initial = node.data.subBlocks?.maxIterations;
	const [value, setValue] = useState(() =>
		typeof initial === "number" ? String(initial) : "",
	);

	const commit = () => {
		const clamped = clampMaxIterations(value);
		if (clamped === null) {
			patch.patchNode(node.data.blockId, {
				deleteSubBlockKeys: ["maxIterations"],
			});
			setValue("");
			return;
		}
		patch.patchNode(node.data.blockId, {
			subBlocksPatch: { maxIterations: clamped },
		});
		setValue(String(clamped));
	};

	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor="loop-max-iterations" className="text-xs">
				Максимум итераций
			</Label>
			<Input
				id="loop-max-iterations"
				type="number"
				min={1}
				max={200}
				step={1}
				className="h-8 text-xs"
				placeholder="напр. 5 (пусто — без лимита)"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
				}}
			/>
			<p className="text-[11px] text-muted-foreground">
				Тело цикла настраивается связями на холсте.
			</p>
		</div>
	);
}
