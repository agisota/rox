/**
 * `@rox/collab/yjs-binding` — the Liveblocks-backed Yjs binding factory.
 *
 * This is the ONLY module that pulls in `@liveblocks/yjs`, so the dependency
 * stays inside `@rox/collab` (where it is declared) and web consumers import
 * just `@rox/collab`. It wires a shared `Y.Doc` to a Liveblocks room via
 * `LiveblocksYjsProvider` and exposes a tiny imperative surface the React
 * textarea binding drives. The text-diff math itself lives in the pure,
 * server-free `./yjs` module (unit-tested for convergence without Liveblocks).
 *
 * The room argument is typed structurally (only what `LiveblocksYjsProvider`
 * needs) so a unit test can inject a minimal fake room — no live cloud, no real
 * socket — and still exercise seed + local-apply + remote-mirror + teardown.
 */

import { LiveblocksYjsProvider } from "@liveblocks/yjs";
import * as Y from "yjs";

import { isLocalOrigin, NOTE_TEXT_KEY, syncStringToYText } from "./yjs";

/**
 * The provider surface the binding depends on. `LiveblocksYjsProvider` (and any
 * test fake) must satisfy this — sync notifications + teardown. Declared
 * structurally so a fake never re-implements the SDK's private members.
 */
export interface YjsBindingProvider {
	readonly synced: boolean;
	on(event: "sync", listener: (isSynced: boolean) => void): void;
	off(event: "sync", listener: (isSynced: boolean) => void): void;
	destroy(): void;
}

/** Construct a `LiveblocksYjsProvider` for a room + doc. Swapped in tests. */
export type YjsProviderFactory = (doc: Y.Doc) => YjsBindingProvider;

export interface NoteYjsBindingOptions {
	/**
	 * The server-loaded note body. Seeds the shared text ONLY when this client is
	 * the first peer (the shared doc is still empty after the initial sync); a
	 * non-empty remote doc always wins, so a late joiner never clobbers history.
	 */
	initialText: string;
	/**
	 * Called with the shared text whenever it changes from a REMOTE edit (or the
	 * initial sync). The textarea binding pushes this into React state. Local
	 * echoes are filtered out via the binding's origin tag.
	 */
	onText: (text: string) => void;
	/**
	 * Inject a provider factory (tests pass a fake). Defaults to the real
	 * `LiveblocksYjsProvider` over the given Liveblocks room.
	 */
	providerFactory: YjsProviderFactory;
}

export interface NoteYjsBinding {
	/** Apply the textarea's latest value as a minimal, locally-tagged splice. */
	applyLocal(next: string): void;
	/** The current shared text. */
	getText(): string;
	/** True once the provider has completed its initial sync. */
	isSynced(): boolean;
	/** Tear down observers, provider, and the Y.Doc. */
	destroy(): void;
}

/**
 * Create a note co-editing binding: a fresh `Y.Doc`, a Liveblocks Yjs provider,
 * and the seed/observe wiring. Returns an imperative handle the React layer
 * drives. All local writes are tagged with a private origin so the observer
 * only mirrors genuinely remote edits back to `onText`.
 */
export function createNoteYjsBinding(
	options: NoteYjsBindingOptions,
): NoteYjsBinding {
	const { initialText, onText, providerFactory } = options;

	const doc = new Y.Doc();
	const text = doc.getText(NOTE_TEXT_KEY);
	const localOrigin = Symbol("note-editor-local");

	const provider = providerFactory(doc);

	const handleSync = (isSynced: boolean) => {
		if (!isSynced) return;
		// First peer in seeds the doc; otherwise the remote content is canonical.
		if (text.length === 0 && initialText.length > 0) {
			syncStringToYText(text, initialText, localOrigin);
		}
		onText(text.toString());
	};

	const observer = (event: Y.YTextEvent) => {
		// Ignore echoes of our own writes; only remote edits update local state.
		if (isLocalOrigin(event.transaction, localOrigin)) return;
		onText(text.toString());
	};

	text.observe(observer);
	provider.on("sync", handleSync);
	// Some provider versions emit the first sync before this listener attaches;
	// reflect the current status defensively so we never miss the seed.
	if (provider.synced) handleSync(true);

	return {
		applyLocal(next: string) {
			syncStringToYText(text, next, localOrigin);
		},
		getText() {
			return text.toString();
		},
		isSynced() {
			return provider.synced;
		},
		destroy() {
			text.unobserve(observer);
			provider.off("sync", handleSync);
			provider.destroy();
			doc.destroy();
		},
	};
}

/**
 * Default real provider factory: a `LiveblocksYjsProvider` over a Liveblocks
 * room. The room type is taken from the provider constructor itself so callers
 * pass exactly what `useRoom()` returns without this package re-declaring the
 * heavy `@liveblocks/core` room type.
 */
export function liveblocksProviderFactory(
	room: ConstructorParameters<typeof LiveblocksYjsProvider>[0],
): YjsProviderFactory {
	return (doc: Y.Doc) =>
		new LiveblocksYjsProvider(room, doc) as unknown as YjsBindingProvider;
}
