import { bucketActivityToolCalls } from "@rox/chat/shared";
import {
	ActivityWorklog,
	type ActivityWorklogGroup,
} from "@rox/ui/ai-elements/activity-worklog";
import { useMemo } from "react";
import { ACTIVITY_LABELS } from "renderer/components/Chat/ChatInterface/constants/activity-labels";
import {
	getToolIcon,
	getToolTitle,
	toActivityToolCall,
} from "renderer/components/Chat/ChatInterface/utils/activity-display";
import type { ToolPart } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import { useActivityWorklogCollapse } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/hooks/useActivityWorklogCollapse";

/**
 * F39 — Mounts the persistent, verb-bucketed Activity worklog timeline for a run
 * of consecutive tool calls in the v2-workspace chat stream.
 *
 * Buckets `parts` with the shared `bucketActivityToolCalls` selector (one source
 * of truth) and renders the framework-agnostic `ActivityWorklog`. Collapse state
 * is persisted per-chat via `useActivityWorklogCollapse`, so the timeline does
 * not vanish post-stream and survives chat switch.
 */
export function ActivityWorklogSection({
	parts,
	chatId,
}: {
	parts: ToolPart[];
	chatId: string;
}) {
	const { open, setOpen } = useActivityWorklogCollapse(chatId);

	const groups = useMemo<ActivityWorklogGroup[]>(() => {
		const byId = new Map<string, ToolPart>();
		for (const part of parts) byId.set(part.toolCallId, part);
		const calls = parts.map(toActivityToolCall);
		return bucketActivityToolCalls(calls).map((group) => ({
			id: group.id,
			summary: group.summary,
			isPending: group.tense === "present",
			isError: group.hasError,
			items: group.calls.map((call) => {
				const part = byId.get(call.id);
				return {
					icon: getToolIcon(call.name),
					title: part ? getToolTitle(part) : call.name,
					subtitle: call.detail,
					isPending: call.isPending,
					isError: call.isError,
				};
			}),
		}));
	}, [parts]);

	if (groups.length === 0) return null;

	return (
		<ActivityWorklog
			groups={groups}
			label={ACTIVITY_LABELS.header}
			onOpenChange={setOpen}
			open={open}
		/>
	);
}
