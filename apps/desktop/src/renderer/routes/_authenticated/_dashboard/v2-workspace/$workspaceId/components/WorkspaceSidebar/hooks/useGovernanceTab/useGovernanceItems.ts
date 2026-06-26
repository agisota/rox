import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { authClient } from "renderer/lib/auth-client";
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
 * org-scoped `v2WorkspaceGovernance` Electric collection and exposes typed
 * add/remove/update mutations. Cache-first: `useLiveQuery` reads the collection
 * synchronously, so the section renders immediately with no loading flash.
 *
 * Persistence (#517): mutations write to the Electric collection, whose
 * onInsert/onUpdate/onDelete round-trip through the `governance` tRPC router and
 * sync back through the electric-proxy. The optimistic insert carries the full
 * DB row shape; the server is the authority for `organizationId`/`createdBy`,
 * and the synced row replaces the optimistic one.
 */
export function useGovernanceItems(workspaceId: string): GovernanceItemsApi {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? "";
	const userId = session?.user?.id ?? "";

	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ item: collections.v2WorkspaceGovernance })
				.where(({ item }) => eq(item.v2WorkspaceId, workspaceId)),
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
			if (!trimmed || !organizationId || !userId) return;
			const existing = rows.filter((r) => r.kind === kind);
			const nextOrder =
				existing.reduce((max, r) => Math.max(max, r.order), -1) + 1;
			const now = new Date();
			collections.v2WorkspaceGovernance.insert({
				id: makeId(),
				organizationId,
				v2WorkspaceId: workspaceId,
				createdBy: userId,
				kind,
				text: trimmed,
				order: nextOrder,
				createdAt: now,
				updatedAt: now,
			});
		},
		[collections, workspaceId, rows, organizationId, userId],
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
