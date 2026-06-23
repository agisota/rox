import { Label } from "@rox/ui/label";
import { Textarea } from "@rox/ui/textarea";
import { useState } from "react";
import type { NodeFormProps } from "./types";

const OUTPUT_NOTE_MAX = 2000;

/**
 * Response (terminal) node config. No required fields — the node ends the run.
 * An optional free-form output note is stored in `subBlocks.outputNote` (≤2000)
 * for the author's own documentation; it does not shape runtime output in v1.
 */
export function FinalNodeForm({ node, patch }: NodeFormProps) {
	const initial = node.data.subBlocks?.outputNote;
	const [value, setValue] = useState(() =>
		typeof initial === "string" ? initial : "",
	);

	const commit = () => {
		const trimmed = value.trim().slice(0, OUTPUT_NOTE_MAX);
		if (trimmed.length === 0) {
			patch.patchNode(node.data.blockId, {
				deleteSubBlockKeys: ["outputNote"],
			});
			setValue("");
			return;
		}
		patch.patchNode(node.data.blockId, {
			subBlocksPatch: { outputNote: trimmed },
		});
		setValue(trimmed);
	};

	return (
		<div className="flex flex-col gap-1.5">
			<p className="text-[11px] text-muted-foreground">
				Финальный узел завершает выполнение пайплайна.
			</p>
			<Label htmlFor="final-output-note" className="text-xs">
				Заметка о результате
			</Label>
			<Textarea
				id="final-output-note"
				className="min-h-16 text-xs"
				placeholder="Необязательная заметка о том, что возвращает пайплайн."
				maxLength={OUTPUT_NOTE_MAX}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={commit}
			/>
		</div>
	);
}
