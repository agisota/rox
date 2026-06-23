"use client";

import { Label } from "@rox/ui/label";
import { Textarea } from "@rox/ui/textarea";
import { useState } from "react";
import type { NodeFormProps } from "./types";

const APPROVAL_MAX = 2000;

/**
 * Human-approval node config. Optional approval message/instruction shown to the
 * approver, stored in `subBlocks.approvalMessage` (≤2000). Blank clears the key.
 */
export function ConfirmationNodeForm({ node, patch }: NodeFormProps) {
	const initial = node.data.subBlocks?.approvalMessage;
	const [value, setValue] = useState(() =>
		typeof initial === "string" ? initial : "",
	);

	const commit = () => {
		const trimmed = value.trim().slice(0, APPROVAL_MAX);
		if (trimmed.length === 0) {
			patch.patchNode(node.data.blockId, {
				deleteSubBlockKeys: ["approvalMessage"],
			});
			setValue("");
			return;
		}
		patch.patchNode(node.data.blockId, {
			subBlocksPatch: { approvalMessage: trimmed },
		});
		setValue(trimmed);
	};

	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor="approval-message" className="text-xs">
				Сообщение для подтверждения
			</Label>
			<Textarea
				id="approval-message"
				className="min-h-20 text-xs"
				placeholder="Что должен проверить человек перед продолжением? (необязательно)"
				maxLength={APPROVAL_MAX}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={commit}
			/>
		</div>
	);
}
