import {
	ALL_TAGS_FILTER,
	TagFilterPillBar,
	type TagFilterState,
	type TagLabel,
	type TagPill,
	tagFilterToListInput,
	toggleLabel,
} from "@rox/ui/tag-filter-pill-bar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";

interface SessionLabelPillBarProps {
	/**
	 * Notifies the parent of the matching session ids when a label filter is
	 * active, or `null` when the filter is `all`/`unassigned` (no server-side
	 * narrowing) so the parent shows its full IPC-driven list unchanged.
	 */
	onFilteredSessionIdsChange: (sessionIds: string[] | null) => void;
}

/**
 * Desktop lead-mount of the F10 tag pill-bar over the chat list (Hermes-borrow
 * F10). Owns the tri-state filter, reads the org label registry via
 * `chatLabels.list`, drives `chat.listSessions({ labelsAny })` for the active
 * filter, and runs the label CRUD mutations over the cloud tRPC transport. The
 * bar itself and the pill-derivation live in `@rox/ui` so web and mobile reuse
 * the same core; this container is the desktop cloud-tRPC wiring only.
 */
export function SessionLabelPillBar({
	onFilteredSessionIdsChange,
}: SessionLabelPillBarProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<TagFilterState>(ALL_TAGS_FILTER);

	const labelsQuery = useQuery(trpc.chatLabels.list.queryOptions());

	const listInput = useMemo(() => tagFilterToListInput(filter), [filter]);
	const isLabelFilter = listInput.labelsAny !== undefined;

	// Only hit the label-aware session query when a label filter is active; an
	// empty input would just duplicate the IPC list.
	const filteredSessions = useQuery({
		...trpc.chat.listSessions.queryOptions(listInput),
		enabled: isLabelFilter,
	});

	useEffect(() => {
		if (!isLabelFilter) {
			onFilteredSessionIdsChange(null);
			return;
		}
		if (filteredSessions.data) {
			onFilteredSessionIdsChange(
				filteredSessions.data.sessions.map((session) => session.id),
			);
		}
	}, [isLabelFilter, filteredSessions.data, onFilteredSessionIdsChange]);

	const invalidateLabels = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.chatLabels.list.queryKey(),
		});
	const createLabel = useMutation(
		trpc.chatLabels.create.mutationOptions({ onSuccess: invalidateLabels }),
	);
	const updateLabel = useMutation(
		trpc.chatLabels.update.mutationOptions({ onSuccess: invalidateLabels }),
	);
	const deleteLabel = useMutation(
		trpc.chatLabels.delete.mutationOptions({ onSuccess: invalidateLabels }),
	);

	const labels: TagLabel[] = labelsQuery.data ?? [];

	return (
		<TagFilterPillBar
			labels={labels}
			filter={filter}
			onSelectPill={(pill: TagPill) => {
				if (pill.kind === "all") {
					setFilter(ALL_TAGS_FILTER);
					return;
				}
				if (pill.kind === "unassigned") {
					setFilter({ kind: "unassigned" });
					return;
				}
				if (pill.name) {
					const name = pill.name;
					setFilter((current) => toggleLabel(current, name));
				}
			}}
			onCreateLabel={(name) => createLabel.mutate({ name })}
			onRenameLabel={(label, name) =>
				updateLabel.mutate({ labelId: label.id, name })
			}
			onRecolorLabel={(label, color) =>
				updateLabel.mutate({ labelId: label.id, color })
			}
			onSetLabelIcon={(label, icon) =>
				updateLabel.mutate({ labelId: label.id, icon })
			}
			onDeleteLabel={(label) => deleteLabel.mutate({ labelId: label.id })}
		/>
	);
}
