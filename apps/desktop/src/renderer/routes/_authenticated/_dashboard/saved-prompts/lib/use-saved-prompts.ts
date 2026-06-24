import { toast } from "@rox/ui/sonner";
import { useCallback, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	decodeBody,
	EMPTY_METADATA,
	encodeBody,
	normalizeTags,
} from "./prompt-metadata";
import type { PromptEntry, PromptMetadata, RawSavedPrompt } from "./types";
import { parseVariableNames } from "./variables";

function toEntry(row: RawSavedPrompt): PromptEntry {
	const { body, metadata } = decodeBody(row.body);
	return {
		id: row.id,
		title: row.title,
		body,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		tags: metadata.tags,
		favorite: metadata.favorite,
		useCount: metadata.useCount,
		lastUsedAt: metadata.lastUsedAt,
		variableNames: parseVariableNames(body),
	};
}

function metadataOf(entry: PromptEntry): PromptMetadata {
	return {
		tags: entry.tags,
		favorite: entry.favorite,
		useCount: entry.useCount,
		lastUsedAt: entry.lastUsedAt,
	};
}

export interface CreatePromptArgs {
	title: string;
	body: string;
	tags?: string[];
	favorite?: boolean;
}

export interface UpdatePromptArgs {
	id: string;
	title: string;
	body: string;
	tags?: string[];
	favorite?: boolean;
}

/**
 * Central data layer for the prompt library. Reads `savedPrompts.list`, decodes
 * each row into a `PromptEntry` (clean body + metadata + parsed variable names),
 * and exposes metadata-aware mutations that re-encode the hidden block before
 * writing back through the EXISTING create/update mutations. No new tRPC
 * procedures or schema columns are required — the surface stays fully
 * offline-first over the local `publicProcedure` router.
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

	const createPrompt = useCallback(
		(args: CreatePromptArgs) => {
			const metadata: PromptMetadata = {
				...EMPTY_METADATA,
				tags: normalizeTags(args.tags ?? []),
				favorite: args.favorite ?? false,
			};
			return createMutation.mutateAsync({
				title: args.title.trim(),
				body: encodeBody(args.body, metadata),
			});
		},
		[createMutation],
	);

	const updatePrompt = useCallback(
		(args: UpdatePromptArgs) => {
			const existing = entries.find((entry) => entry.id === args.id);
			const metadata: PromptMetadata = {
				tags: normalizeTags(args.tags ?? existing?.tags ?? []),
				favorite: args.favorite ?? existing?.favorite ?? false,
				useCount: existing?.useCount ?? 0,
				lastUsedAt: existing?.lastUsedAt ?? null,
			};
			return updateMutation.mutateAsync({
				id: args.id,
				title: args.title.trim(),
				body: encodeBody(args.body, metadata),
			});
		},
		[entries, updateMutation],
	);

	const deletePrompt = useCallback(
		(id: string) => deleteMutation.mutate({ id }),
		[deleteMutation],
	);

	const writeMetadata = useCallback(
		(entry: PromptEntry, next: PromptMetadata) =>
			updateMutation.mutateAsync({
				id: entry.id,
				title: entry.title,
				body: encodeBody(entry.body, next),
			}),
		[updateMutation],
	);

	const toggleFavorite = useCallback(
		(entry: PromptEntry) =>
			writeMetadata(entry, {
				...metadataOf(entry),
				favorite: !entry.favorite,
			}),
		[writeMetadata],
	);

	/** Fire-and-forget usage bump on insert/copy (never blocks the action). */
	const incrementUse = useCallback(
		(entry: PromptEntry) => {
			void writeMetadata(entry, {
				...metadataOf(entry),
				useCount: entry.useCount + 1,
				lastUsedAt: Date.now(),
			}).catch(() => {
				// Usage tracking is best-effort; a failure must not surface.
			});
		},
		[writeMetadata],
	);

	return {
		entries,
		allTags,
		isLoading: query.isLoading,
		isError: query.isError,
		refetch: query.refetch,
		createPrompt,
		updatePrompt,
		deletePrompt,
		toggleFavorite,
		incrementUse,
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
	};
}

export type UseSavedPromptsResult = ReturnType<typeof useSavedPrompts>;
