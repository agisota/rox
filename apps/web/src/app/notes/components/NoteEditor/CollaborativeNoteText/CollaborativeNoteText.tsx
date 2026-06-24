"use client";

import { authClient } from "@rox/auth/client";
import { RoxRoomProvider, useOthers, useRoom } from "@rox/collab/client";
import {
	createNoteYjsBinding,
	liveblocksProviderFactory,
	type NoteYjsBinding,
} from "@rox/collab/yjs-binding";
import { Textarea } from "@rox/ui/textarea";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { env } from "@/env";
import { trpcClient } from "@/trpc/client";
import { resolveNoteEditorGate } from "../../../utils/resolveNoteEditorGate";

/** A peer slice as exposed by Liveblocks `useOthers()` for this surface. */
interface PresenceOther {
	connectionId: number;
}

export interface CollaborativeNoteTextProps {
	/** The active note the editor binds its shared Y.Doc to. */
	noteId: string;
	/** The current single-player markdown value (server-loaded note body). */
	value: string;
	/**
	 * Single-player change handler. The collaborative binding calls this for BOTH
	 * local keystrokes and inbound remote edits, so the parent autosave + local
	 * mirror behave identically to the non-collaborative editor.
	 */
	onChange: (next: string) => void;
	/** Test seam: active org id (defaults to the better-auth session). */
	organizationId?: string;
	/** Test seam: Liveblocks public key (defaults to the validated web env). */
	publicKey?: string;
}

/**
 * Real-time collaborative binding for the markdown note body.
 *
 * It REUSES the existing Liveblocks room (`org:{orgId}:note:{noteId}`, the same
 * id `NotePresence` already opens — see `NotePresence.tsx`) and binds a shared
 * `Y.Doc` to it via `@liveblocks/yjs` (through `@rox/collab/yjs-binding`). The
 * Yjs ↔ textarea binding is the pure single-splice core from `@rox/collab/yjs`,
 * so two users editing the same note converge in real time.
 *
 * Gated behind `collaboration.editor` via {@link resolveNoteEditorGate}: when the
 * gate is CLOSED this renders the plain controlled textarea (identical to the
 * single-player editor — NO regression); when OPEN, the same textarea is also a
 * CRDT peer. The token mint is delegated to the `collab.authRoom` tRPC mutation,
 * so no secret reaches the client.
 */
export function CollaborativeNoteText({
	noteId,
	value,
	onChange,
	organizationId,
	publicKey,
}: CollaborativeNoteTextProps) {
	const session = authClient.useSession();
	const activeOrganizationId =
		organizationId ?? session.data?.session?.activeOrganizationId ?? undefined;
	const liveblocksPublicKey =
		publicKey ?? env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY;

	const gate = useMemo(
		() =>
			resolveNoteEditorGate({
				publicKey: liveblocksPublicKey,
				organizationId: activeOrganizationId,
				noteId,
			}),
		[liveblocksPublicKey, activeOrganizationId, noteId],
	);

	const authEndpoint = useCallback(async (roomId: string) => {
		const { token } = await trpcClient.collab.authRoom.mutate({ roomId });
		return { token };
	}, []);

	// Gate CLOSED → single-player textarea, byte-for-byte the editor's default.
	if (!gate.enabled || !gate.roomId) {
		return <PlainNoteTextarea value={value} onChange={onChange} />;
	}

	return (
		<RoxRoomProvider roomId={gate.roomId} authEndpoint={authEndpoint}>
			<YjsNoteTextarea value={value} onChange={onChange} />
		</RoxRoomProvider>
	);
}

/** The exact single-player textarea (kept in one place so both paths match). */
function PlainNoteTextarea({
	value,
	onChange,
}: {
	value: string;
	onChange: (next: string) => void;
}) {
	return (
		<Textarea
			aria-label="Текст заметки в формате Markdown"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder="Пишите в Markdown…"
			className="min-h-[55vh] flex-1 resize-none font-mono text-sm leading-relaxed"
		/>
	);
}

/**
 * The textarea bound to a shared `Y.Text` over the Liveblocks room. Must render
 * INSIDE `RoxRoomProvider` so `useRoom()` resolves the live room handle.
 */
function YjsNoteTextarea({
	value,
	onChange,
}: {
	value: string;
	onChange: (next: string) => void;
}) {
	const room = useRoom();
	const others = useOthers() as unknown as readonly PresenceOther[];

	const bindingRef = useRef<NoteYjsBinding | null>(null);
	const [synced, setSynced] = useState(false);

	// Keep the freshest onChange + the latest server value without re-running the
	// bind effect on every keystroke (which would tear down the live provider).
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const seedRef = useRef(value);
	seedRef.current = value;

	// Bind once per room: open the provider, seed an empty shared doc, and mirror
	// remote edits into React state. Torn down on unmount / room change.
	useEffect(() => {
		const binding = createNoteYjsBinding({
			initialText: seedRef.current,
			onText: (text) => onChangeRef.current(text),
			providerFactory: liveblocksProviderFactory(room),
		});
		bindingRef.current = binding;
		setSynced(binding.isSynced());

		// Reflect sync completion so local edits start flowing into the shared doc.
		const poll = setInterval(() => {
			if (binding.isSynced()) {
				setSynced(true);
				clearInterval(poll);
			}
		}, 150);

		return () => {
			clearInterval(poll);
			binding.destroy();
			bindingRef.current = null;
		};
	}, [room]);

	// Local keystroke → minimal Y.Text splice (tagged local) → autosave via the
	// parent onChange. Until the first sync we still edit locally (optimistic);
	// the seed/observe path reconciles once connected.
	const handleLocalChange = (next: string) => {
		if (synced && bindingRef.current) {
			bindingRef.current.applyLocal(next);
		}
		onChange(next);
	};

	const onlineCount = others.length + 1;

	return (
		<div className="flex flex-1 flex-col gap-1.5">
			<Textarea
				aria-label="Текст заметки в формате Markdown"
				value={value}
				onChange={(e) => handleLocalChange(e.target.value)}
				placeholder="Пишите в Markdown…"
				className="min-h-[55vh] flex-1 resize-none font-mono text-sm leading-relaxed"
			/>
			{onlineCount > 1 ? (
				<span className="text-muted-foreground text-xs">
					Совместное редактирование: {onlineCount} участника
				</span>
			) : null}
		</div>
	);
}
