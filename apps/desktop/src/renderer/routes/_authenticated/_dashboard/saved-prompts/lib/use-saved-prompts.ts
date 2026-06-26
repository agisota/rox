import { toast } from "@rox/ui/sonner";
import { useCallback, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { PromptEntry, RawSavedPrompt } from "./types";
import { parseVariableNames } from "./variables";

function normalizeTags(tags: readonly string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of tags) {
		const tag = raw.trim().replace(/\s+/g, " ");
		if (tag.length === 0) continue;
		const key = tag.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(tag);
	}
	return out;
}

function toEntry(row: RawSavedPrompt): PromptEntry {
	return {
		id: row.id,
		title: row.title,
		body: row.body,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		folder: row.folder ?? null,
		tags: row.tags ?? [],
		favorite: row.isFavorite,
		useCount: row.copyCount,
		lastUsedAt: row.lastUsedAt ?? null,
		position: row.position ?? null,
		variableNames: parseVariableNames(row.body),
	};
}

export interface CreatePromptArgs {
	title: string;
	body: string;
	folder?: string | null;
	tags?: string[];
	favorite?: boolean;
}

export interface UpdatePromptArgs {
	id: string;
	title: string;
	body: string;
	folder?: string | null;
	tags?: string[];
	favorite?: boolean;
}

/**
 * Central data layer for the prompt library. Reads `savedPrompts.list`, maps
 * each DB row into a `PromptEntry` (body + real metadata columns + parsed
 * variable names), and exposes mutations that write directly to the schema
 * columns — folders, tags, favorite, usage and drag-order all persist as real
 * fields (no hidden body codec). Optimistic-free + offline-first over the local
 * electron-tRPC `publicProcedure` router.
 */
export function useSavedPrompts() {
	const utils = electronTrpc.useUtils();
	const query = electronTrpc.savedPrompts.list.useQuery();

	const entries = useMemo<PromptEntry[]>(
		() => (query.data ?? []).map(toEntry),
		[query.data],
	);

	const allTags = useMemo<string[]>(() => {
		const counts = new Map<string, number>();
		for (const entry of entries) {
			for (const tag of entry.tags) {
				counts.set(tag, (counts.get(tag) ?? 0) + 1);
			}
		}
		return Array.from(counts.keys()).sort((a, b) =>
			a.localeCompare(b, "ru", { sensitivity: "base" }),
		);
	}, [entries]);

	const allFolders = useMemo<string[]>(() => {
		const set = new Set<string>();
		for (const entry of entries) {
			if (entry.folder) set.add(entry.folder);
		}
		return Array.from(set).sort((a, b) =>
			a.localeCompare(b, "ru", { sensitivity: "base" }),
		);
	}, [entries]);

	const invalidate = useCallback(() => {
		void utils.savedPrompts.list.invalidate();
	}, [utils]);

	const createMutation = electronTrpc.savedPrompts.create.useMutation({
		onSuccess: invalidate,
		onError: (error) => toast.error(`Не удалось сохранить: ${error.message}`),
	});
	const updateMutation = electronTrpc.savedPrompts.update.useMutation({
		onSuccess: invalidate,
		onError: (error) => toast.error(`Не удалось обновить: ${error.message}`),
	});
	const deleteMutation = electronTrpc.savedPrompts.delete.useMutation({
		onSuccess: invalidate,
		onError: (error) => toast.error(`Не удалось удалить: ${error.message}`),
	});
	const reorderMutation = electronTrpc.savedPrompts.reorder.useMutation({
		onSuccess: invalidate,
		onError: (error) =>
			toast.error(`Не удалось сохранить порядок: ${error.message}`),
	});
	const incrementCopyMutation =
		electronTrpc.savedPrompts.incrementCopy.useMutation({
			onSuccess: invalidate,
		});

	const createPrompt = useCallback(
		(args: CreatePromptArgs) =>
			createMutation.mutateAsync({
				title: args.title.trim(),
				body: args.body,
				folder: args.folder ?? null,
				tags: normalizeTags(args.tags ?? []),
				isFavorite: args.favorite ?? false,
			}),
		[createMutation],
	);

	const updatePrompt = useCallback(
		(args: UpdatePromptArgs) =>
			updateMutation.mutateAsync({
				id: args.id,
				title: args.title.trim(),
				body: args.body,
				folder: args.folder,
				tags: args.tags !== undefined ? normalizeTags(args.tags) : undefined,
				isFavorite: args.favorite,
			}),
		[updateMutation],
	);

	const deletePrompt = useCallback(
		(id: string) => deleteMutation.mutate({ id }),
		[deleteMutation],
	);

	const toggleFavorite = useCallback(
		(entry: PromptEntry) =>
			updateMutation.mutateAsync({
				id: entry.id,
				title: entry.title,
				body: entry.body,
				isFavorite: !entry.favorite,
			}),
		[updateMutation],
	);

	const moveToFolder = useCallback(
		(entry: PromptEntry, folder: string | null) =>
			updateMutation.mutateAsync({
				id: entry.id,
				title: entry.title,
				body: entry.body,
				folder,
			}),
		[updateMutation],
	);

	/** Persist a drag-reordered id list (dense 0..n positions). */
	const reorder = useCallback(
		(orderedIds: string[]) => reorderMutation.mutateAsync({ orderedIds }),
		[reorderMutation],
	);

	/** Fire-and-forget usage bump on insert/copy (never blocks the action). */
	const incrementUse = useCallback(
		(entry: PromptEntry) => {
			incrementCopyMutation.mutate({ id: entry.id });
		},
		[incrementCopyMutation],
	);

	return {
		entries,
		allTags,
		allFolders,
		isLoading: query.isLoading,
		isError: query.isError,
		refetch: query.refetch,
		createPrompt,
		updatePrompt,
		deletePrompt,
		toggleFavorite,
		moveToFolder,
		reorder,
		incrementUse,
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
	};
}

export type UseSavedPromptsResult = ReturnType<typeof useSavedPrompts>;
