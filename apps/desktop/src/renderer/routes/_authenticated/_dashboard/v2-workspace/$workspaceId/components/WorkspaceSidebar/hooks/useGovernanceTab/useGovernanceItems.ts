import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type {
	GovernanceKind,
	WorkspaceGovernanceItemRow,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

function makeId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `gov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface GovernanceItemsApi {
	itemsByKind: Record<GovernanceKind, WorkspaceGovernanceItemRow[]>;
	totalCount: number;
	addItem: (kind: GovernanceKind, text: string) => void;
	removeItem: (id: string) => void;
	updateItemText: (id: string, text: string) => void;
}

/**
 * Live-queries governance items (goals/tasks/missions) for a workspace from the
 * local `v2WorkspaceGovernance` collection and exposes typed add/remove/update
 * mutations. Cache-first: `useLiveQuery` reads the local collection
 * synchronously, so the section renders immediately with no loading flash.
 *
 * TODO(server): mutations write only to the local collection today. When a
 * backend collection lands, the collection factory in `collections.ts` gains
 * onInsert/onUpdate/onDelete and these mutations sync transparently.
 */
export function useGovernanceItems(workspaceId: string): GovernanceItemsApi {
	const collections = useCollections();

	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ item: collections.v2WorkspaceGovernance })
				.where(({ item }) => eq(item.workspaceId, workspaceId)),
		[collections, workspaceId],
	);

	const itemsByKind = useMemo<
		Record<GovernanceKind, WorkspaceGovernanceItemRow[]>
	>(() => {
		const buckets: Record<GovernanceKind, WorkspaceGovernanceItemRow[]> = {
			goal: [],
			task: [],
			mission: [],
		};
		for (const row of rows) {
			buckets[row.kind].push(row);
		}
		for (const kind of Object.keys(buckets) as GovernanceKind[]) {
			buckets[kind].sort((a, b) => {
				if (a.order !== b.order) return a.order - b.order;
				return a.createdAt.getTime() - b.createdAt.getTime();
			});
		}
		return buckets;
	}, [rows]);

	const addItem = useCallback(
		(kind: GovernanceKind, text: string) => {
			const trimmed = text.trim();
			if (!trimmed) return;
			const existing = rows.filter((r) => r.kind === kind);
			const nextOrder =
				existing.reduce((max, r) => Math.max(max, r.order), -1) + 1;
			collections.v2WorkspaceGovernance.insert({
				id: makeId(),
				workspaceId,
				kind,
				text: trimmed,
				order: nextOrder,
				createdAt: new Date(),
			});
		},
		[collections, workspaceId, rows],
	);

	const removeItem = useCallback(
		(id: string) => {
			if (!collections.v2WorkspaceGovernance.get(id)) return;
			collections.v2WorkspaceGovernance.delete(id);
		},
		[collections],
	);

	const updateItemText = useCallback(
		(id: string, text: string) => {
			const trimmed = text.trim();
			if (!trimmed) return;
			if (!collections.v2WorkspaceGovernance.get(id)) return;
			collections.v2WorkspaceGovernance.update(id, (draft) => {
				draft.text = trimmed;
			});
		},
		[collections],
	);

	return {
		itemsByKind,
		totalCount: rows.length,
		addItem,
		removeItem,
		updateItemText,
	};
}
