import { describe, expect, it } from "bun:test";
import type * as Y from "yjs";
import { NOTE_TEXT_KEY } from "./yjs";
import {
	createNoteYjsBinding,
	type YjsBindingProvider,
	type YjsProviderFactory,
} from "./yjs-binding";

/**
 * A minimal fake Liveblocks Yjs provider: it never touches the network, but it
 * lets the test drive the `sync` lifecycle and observe the bound `Y.Doc`. This
 * exercises the REAL binding factory (seed / local-apply / remote-mirror /
 * teardown) without a live server — the wire convergence itself is proven in
 * `yjs.test.ts`.
 */
class FakeProvider implements YjsBindingProvider {
	synced = false;
	private listeners = new Set<(s: boolean) => void>();

	on(_event: "sync", listener: (s: boolean) => void): void {
		this.listeners.add(listener);
	}
	off(_event: "sync", listener: (s: boolean) => void): void {
		this.listeners.delete(listener);
	}
	destroy(): void {
		this.listeners.clear();
	}
	/** Test helper: flip to synced and notify (what the cloud would do). */
	emitSync(): void {
		this.synced = true;
		for (const l of this.listeners) l(true);
	}
}

function makeFactory(): {
	factory: YjsProviderFactory;
	provider: FakeProvider;
	doc: () => Y.Doc;
} {
	const provider = new FakeProvider();
	let captured: Y.Doc | null = null;
	const factory: YjsProviderFactory = (doc) => {
		captured = doc;
		return provider;
	};
	return {
		factory,
		provider,
		doc: () => {
			if (!captured) throw new Error("provider factory not called");
			return captured;
		},
	};
}

describe("createNoteYjsBinding", () => {
	it("seeds the shared text from initialText when first peer in (empty doc)", () => {
		const { factory, provider, doc } = makeFactory();
		const seen: string[] = [];
		const binding = createNoteYjsBinding({
			initialText: "server body",
			onText: (t) => seen.push(t),
			providerFactory: factory,
		});

		provider.emitSync();

		expect(doc().getText(NOTE_TEXT_KEY).toString()).toBe("server body");
		expect(seen.at(-1)).toBe("server body");
		binding.destroy();
	});

	it("does NOT clobber a non-empty remote doc on join (remote wins)", () => {
		const { provider } = makeFactory();
		const seen: string[] = [];
		const binding = createNoteYjsBinding({
			initialText: "my stale local copy",
			onText: (t) => seen.push(t),
			providerFactory: (d) => {
				// Pre-populate the doc as if a peer already wrote to it before our
				// sync completes, so the seed branch must NOT overwrite it.
				d.getText(NOTE_TEXT_KEY).insert(0, "REMOTE canonical");
				return provider;
			},
		});

		provider.emitSync();

		expect(seen.at(-1)).toBe("REMOTE canonical");
		binding.destroy();
	});

	it("applies a local edit as a minimal splice and reads it back", () => {
		const { factory, provider, doc } = makeFactory();
		const binding = createNoteYjsBinding({
			initialText: "",
			onText: () => {},
			providerFactory: factory,
		});
		provider.emitSync();

		binding.applyLocal("hello");
		binding.applyLocal("hello world");

		expect(binding.getText()).toBe("hello world");
		expect(doc().getText(NOTE_TEXT_KEY).toString()).toBe("hello world");
		binding.destroy();
	});

	it("mirrors a REMOTE edit back via onText but ignores local echoes", () => {
		const { factory, provider, doc } = makeFactory();
		const seen: string[] = [];
		const binding = createNoteYjsBinding({
			initialText: "",
			onText: (t) => seen.push(t),
			providerFactory: factory,
		});
		provider.emitSync();
		const before = seen.length;

		// Local edit: should NOT push a new onText (echo suppression).
		binding.applyLocal("typed here");
		expect(seen.length).toBe(before);

		// Remote edit: a foreign-origin transaction on the same doc DOES notify.
		const sharedText = doc().getText(NOTE_TEXT_KEY);
		doc().transact(() => {
			sharedText.insert(sharedText.length, " + remote");
		}, Symbol("remote-peer"));

		expect(seen.at(-1)).toBe("typed here + remote");
		binding.destroy();
	});

	it("stops mirroring after destroy()", () => {
		const { factory, provider, doc } = makeFactory();
		const seen: string[] = [];
		const binding = createNoteYjsBinding({
			initialText: "",
			onText: (t) => seen.push(t),
			providerFactory: factory,
		});
		provider.emitSync();
		binding.destroy();
		const after = seen.length;

		// A post-teardown remote edit must not call onText anymore.
		const sharedText = doc().getText(NOTE_TEXT_KEY);
		doc().transact(() => {
			sharedText.insert(0, "late");
		}, Symbol("remote-peer"));

		expect(seen.length).toBe(after);
	});
});
