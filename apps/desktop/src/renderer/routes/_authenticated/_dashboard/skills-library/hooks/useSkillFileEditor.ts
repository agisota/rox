/**
 * Editor state machine for a single skill file (Skills library).
 *
 * Owns: the active file's draft vs. persisted content + dirty flag, a debounced
 * 800ms autosave (the Notes/Automations pattern) layered over the existing
 * `skillsLibrary.writeFile` mutation, plus an explicit save. Surfaces the
 * `PAYLOAD_TOO_LARGE` (>512KB) read error so the editor can show the "file too
 * large" banner instead of an empty textbox.
 *
 * The transport is the existing local electron-tRPC router — no new procedures.
 */

import { toast } from "@rox/ui/sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { EDITOR_AUTOSAVE_DELAY_MS } from "../lib/constants";

export type SkillFileReadError = "too-large" | "not-found" | "other" | null;

interface UseSkillFileEditorArgs {
	skillId: string;
	relativePath: string | null;
	/** Whether the active file is editable text (binary blobs skip the read). */
	editable: boolean;
	onSaved?: () => void;
}

export interface SkillFileEditorState {
	draft: string;
	setDraft: (next: string) => void;
	isDirty: boolean;
	isLoading: boolean;
	isSaving: boolean;
	readError: SkillFileReadError;
	/** Explicit save (button / Cmd+S). No-op when not dirty or no active file. */
	save: () => void;
	/** Discard local edits and re-seed from disk (used after a save conflict). */
	reloadFromDisk: () => void;
}

function classifyReadError(message: string, code?: string): SkillFileReadError {
	if (code === "PAYLOAD_TOO_LARGE" || /too large/i.test(message)) {
		return "too-large";
	}
	if (code === "NOT_FOUND" || /not found/i.test(message)) return "not-found";
	return "other";
}

export function useSkillFileEditor({
	skillId,
	relativePath,
	editable,
	onSaved,
}: UseSkillFileEditorArgs): SkillFileEditorState {
	const utils = electronTrpc.useUtils();
	const enabled = relativePath !== null && editable;

	const {
		data: fileData,
		isFetching,
		error,
	} = electronTrpc.skillsLibrary.readFile.useQuery(
		{ id: skillId, relativePath: relativePath ?? "" },
		{ enabled, retry: false },
	);

	const [draft, setDraftState] = useState("");
	const [original, setOriginal] = useState("");
	// Hash of the content the current draft was seeded from. Sent with each
	// write so the backend can reject a save when the file changed on disk.
	const [baseHash, setBaseHash] = useState<string | null>(null);
	const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Track which file the current draft belongs to, so a file switch re-seeds
	// from server data instead of leaking the previous file's edits.
	const loadedKey = useRef<string | null>(null);

	const fileKey = enabled ? `${skillId}::${relativePath}` : null;

	// Seed draft/original when fresh file content arrives for the active file.
	useEffect(() => {
		if (!fileData || fileKey === null) return;
		if (loadedKey.current === fileKey && draft !== original) {
			// Already editing this exact file — don't clobber unsaved edits on refetch.
			return;
		}
		setDraftState(fileData.content);
		setOriginal(fileData.content);
		setBaseHash(fileData.hash);
		loadedKey.current = fileKey;
	}, [fileData, fileKey, draft, original]);

	// Reset editor immediately when the active file becomes unavailable.
	useEffect(() => {
		if (fileKey === null) {
			setDraftState("");
			setOriginal("");
			setBaseHash(null);
			loadedKey.current = null;
		}
	}, [fileKey]);

	const reloadFromDisk = useCallback(() => {
		if (relativePath === null) return;
		// Force a re-seed even with unsaved edits, then refetch.
		loadedKey.current = null;
		void utils.skillsLibrary.readFile.invalidate({
			id: skillId,
			relativePath,
		});
	}, [relativePath, skillId, utils]);

	const writeMutation = electronTrpc.skillsLibrary.writeFile.useMutation({
		onSuccess: (data, variables) => {
			setOriginal(variables.content);
			setBaseHash(data.hash);
			void utils.skillsLibrary.get.invalidate({ id: skillId });
			void utils.skillsLibrary.readFile.invalidate({
				id: skillId,
				relativePath: variables.relativePath,
			});
			onSaved?.();
		},
		onError: (mutationError) => {
			if (mutationError.data?.code === "CONFLICT") {
				toast.error("Файл изменился на диске после открытия", {
					description:
						"Перезагрузите содержимое с диска или перезапишите его своей версией.",
					action: {
						label: "Перезагрузить",
						onClick: reloadFromDisk,
					},
					cancel: {
						label: "Перезаписать",
						onClick: () => forceSaveRef.current(),
					},
				});
				return;
			}
			toast.error(`Не удалось сохранить: ${mutationError.message}`);
		},
	});

	const isDirty = enabled && draft !== original;

	const persist = useCallback(
		(content: string, options?: { force?: boolean }) => {
			if (relativePath === null) return;
			writeMutation.mutate({
				id: skillId,
				relativePath,
				content,
				// Omit the guard on an explicit overwrite so the user's version wins.
				baseHash: options?.force ? undefined : (baseHash ?? undefined),
			});
		},
		[relativePath, skillId, writeMutation, baseHash],
	);

	// Stable ref to force-save the latest draft (used by the conflict toast's
	// "overwrite" action, defined before `persist` in source order).
	const forceSaveRef = useRef<() => void>(() => {});
	forceSaveRef.current = () => persist(draft, { force: true });

	const setDraft = useCallback((next: string) => {
		setDraftState(next);
	}, []);

	// Debounced autosave: fire 800ms after the last keystroke while dirty.
	useEffect(() => {
		if (!isDirty || relativePath === null) return;
		if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
		autosaveTimer.current = setTimeout(() => {
			persist(draft);
		}, EDITOR_AUTOSAVE_DELAY_MS);
		return () => {
			if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
		};
	}, [draft, isDirty, relativePath, persist]);

	const save = useCallback(() => {
		if (!isDirty || relativePath === null) return;
		if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
		persist(draft);
	}, [isDirty, relativePath, draft, persist]);

	const readError: SkillFileReadError = error
		? classifyReadError(error.message, error.data?.code)
		: null;

	return {
		draft,
		setDraft,
		isDirty,
		isLoading: enabled && isFetching && draft.length === 0 && !error,
		isSaving: writeMutation.isPending,
		readError,
		save,
		reloadFromDisk,
	};
}
