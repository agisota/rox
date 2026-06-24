import {
	RoxRoomProvider as DefaultRoomProvider,
	useOthers as defaultUseOthers,
	useRoom as defaultUseRoom,
} from "@rox/collab/client";
import { noteRoomId } from "@rox/collab/types";
import {
	createNoteYjsBinding,
	liveblocksProviderFactory,
	type NoteYjsBinding,
} from "@rox/collab/yjs-binding";
import { Textarea } from "@rox/ui/textarea";
import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";

/** A peer slice as exposed by Liveblocks `useOthers()` for this surface. */
interface PresenceOther {
	connectionId: number;
}

type RoomProviderComponent = ComponentType<{
	roomId: string;
	authEndpoint: (roomId: string) => Promise<{ token: string }>;
	children: ReactNode;
}>;

/** The live `Room` handle as consumed by `liveblocksProviderFactory`. */
type RoomHandle = Parameters<typeof liveblocksProviderFactory>[0];

export interface CollaborativeNoteEditorProps {
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
	/**
	 * Injectable Liveblocks bindings (default to the real `@rox/collab/client`).
	 * Kept as props so tests can supply fakes WITHOUT module-mocking, mirroring the
	 * proven desktop `ThreadPresence` pattern.
	 */
	RoomProvider?: RoomProviderComponent;
	useRoom?: () => RoomHandle;
	useOthers?: () => readonly PresenceOther[];
}

/**
 * Real-time collaborative binding for the desktop markdown note body — the
 * desktop PARITY of the shipped web `CollaborativeNoteText`.
 *
 * It REUSES the EXISTING note Liveblocks room (`org:{orgId}:note:{noteId}`, the
 * same id the web `NoteEditor`/`NotePresence` open — see `noteRoomId` in
 * `@rox/collab/types`) and binds a shared `Y.Doc` to it via the framework-agnostic
 * `createNoteYjsBinding` from `@rox/collab/yjs-binding` (the #438 core — imported,
 * NOT re-implemented). So a desktop user and a web user editing the same note edit
 * the SAME shared document and converge in real time.
 *
 * Gated behind `collaboration.editor` via {@link ExperimentalFeatureGate} (the
 * desktop gate convention, identical to `ThreadPresence`): when the gate is CLOSED
 * this renders the plain controlled textarea with autosave — exactly the
 * single-player editor, NO regression; when OPEN the same textarea is also a CRDT
 * peer. The token mint is delegated to the cloud `collab.authRoom` tRPC mutation,
 * so no secret reaches the client. Liveblocks runs over WebSocket in the Electron
 * renderer just like web.
 */
export function CollaborativeNoteEditor(props: CollaborativeNoteEditorProps) {
	return (
		<ExperimentalFeatureGate
			featureId="collaboration.editor"
			fallback={
				<PlainNoteTextarea value={props.value} onChange={props.onChange} />
			}
		>
			<CollaborativeNoteEditorInner {...props} />
		</ExperimentalFeatureGate>
	);
}

function CollaborativeNoteEditorInner({
	noteId,
	value,
	onChange,
	organizationId,
	RoomProvider = DefaultRoomProvider,
	useRoom,
	useOthers,
}: CollaborativeNoteEditorProps) {
	const { data: session } = authClient.useSession();
	const activeOrganizationId =
		organizationId ?? session?.session?.activeOrganizationId ?? null;

	const authEndpoint = useCallback(async (roomId: string) => {
		const { token } = await apiTrpcClient.collab.authRoom.mutate({ roomId });
		return { token };
	}, []);

	// Without an active org we cannot scope a room; stay single-player rather than
	// open a room that can only ever fail authorization (identical fallback to the
	// gate-closed path, so the editor never regresses).
	if (!activeOrganizationId) {
		return <PlainNoteTextarea value={value} onChange={onChange} />;
	}

	return (
		<RoomProvider
			roomId={noteRoomId(activeOrganizationId, noteId)}
			authEndpoint={authEndpoint}
		>
			<YjsNoteTextarea
				value={value}
				onChange={onChange}
				useRoom={useRoom}
				useOthers={useOthers}
			/>
		</RoomProvider>
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
 * INSIDE `RoomProvider` so `useRoom()` resolves the live room handle. Mirrors the
 * web `YjsNoteTextarea`; the Yjs ↔ textarea binding is the REUSED single-splice
 * core, so two peers converge.
 */
function YjsNoteTextarea({
	value,
	onChange,
	useRoom = defaultUseRoom as () => RoomHandle,
	useOthers = defaultUseOthers as unknown as () => readonly PresenceOther[],
}: {
	value: string;
	onChange: (next: string) => void;
	useRoom?: () => RoomHandle;
	useOthers?: () => readonly PresenceOther[];
}) {
	const room = useRoom();
	const others = useOthers();

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
