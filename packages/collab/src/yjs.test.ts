import { describe, expect, it } from "bun:test";
import * as Y from "yjs";

import {
	computeTextSplice,
	isLocalOrigin,
	NOTE_TEXT_KEY,
	syncStringToYText,
	yTextToString,
} from "./yjs";

/**
 * These tests prove the CRDT co-editing core WITHOUT a live Liveblocks server:
 * two independent `Y.Doc`s stand in for two browsers; exchanging their binary
 * updates is exactly what `LiveblocksYjsProvider` does over the room. If the
 * docs converge here, the same text converges in production over Liveblocks.
 */

/** Apply doc A's state onto doc B and vice-versa until both are identical. */
function exchange(a: Y.Doc, b: Y.Doc): void {
	// State-vector based delta exchange — the same wire protocol the provider
	// uses, so this is a faithful (not a faked) convergence check.
	const updateAtoB = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
	const updateBtoA = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
	Y.applyUpdate(b, updateAtoB);
	Y.applyUpdate(a, updateBtoA);
}

describe("computeTextSplice", () => {
	it("returns a no-op for unchanged text", () => {
		expect(computeTextSplice("hello", "hello")).toEqual({
			index: 0,
			deleteCount: 0,
			insert: "",
		});
	});

	it("captures a pure insertion in the middle", () => {
		// "hello world" -> "hello brave world"
		expect(computeTextSplice("hello world", "hello brave world")).toEqual({
			index: 6,
			deleteCount: 0,
			insert: "brave ",
		});
	});

	it("captures a pure deletion", () => {
		expect(computeTextSplice("hello brave world", "hello world")).toEqual({
			index: 6,
			deleteCount: 6,
			insert: "",
		});
	});

	it("captures a replace-selection edit", () => {
		expect(computeTextSplice("the quick fox", "the slow fox")).toEqual({
			index: 4,
			deleteCount: 5,
			insert: "slow",
		});
	});

	it("captures append at the end", () => {
		expect(computeTextSplice("note", "note!")).toEqual({
			index: 4,
			deleteCount: 0,
			insert: "!",
		});
	});

	it("captures full clear", () => {
		expect(computeTextSplice("anything", "")).toEqual({
			index: 0,
			deleteCount: 8,
			insert: "",
		});
	});
});

describe("syncStringToYText (editor change -> Y.Text delta)", () => {
	it("applies the textarea value onto an empty Y.Text and reads back", () => {
		const doc = new Y.Doc();
		const text = doc.getText(NOTE_TEXT_KEY);
		const applied = syncStringToYText(text, "first draft");
		expect(applied).toBe(true);
		expect(yTextToString(text)).toBe("first draft");
	});

	it("applies an incremental edit as a minimal splice (not a rewrite)", () => {
		const doc = new Y.Doc();
		const text = doc.getText(NOTE_TEXT_KEY);
		syncStringToYText(text, "hello world");

		// Observe the low-level delta the incremental edit produces: a true
		// minimal splice retains the shared prefix/suffix and only touches the
		// changed region (proves we are NOT clearing + reinserting the doc).
		const observed: { delta: unknown[] | null } = { delta: null };
		text.observe((event) => {
			observed.delta = event.changes.delta as unknown[];
		});
		syncStringToYText(text, "hello brave world");

		expect(yTextToString(text)).toBe("hello brave world");
		expect(observed.delta).toEqual([{ retain: 6 }, { insert: "brave " }]);
	});

	it("returns false and mutates nothing on a no-op write", () => {
		const doc = new Y.Doc();
		const text = doc.getText(NOTE_TEXT_KEY);
		syncStringToYText(text, "stable");
		let fired = false;
		text.observe(() => {
			fired = true;
		});
		const applied = syncStringToYText(text, "stable");
		expect(applied).toBe(false);
		expect(fired).toBe(false);
	});
});

describe("Yjs convergence (two-peer co-editing without a server)", () => {
	it("converges when both peers edit and exchange updates", () => {
		const docA = new Y.Doc();
		const docB = new Y.Doc();
		const textA = docA.getText(NOTE_TEXT_KEY);
		const textB = docB.getText(NOTE_TEXT_KEY);

		// Peer A writes the base note, syncs to B.
		syncStringToYText(textA, "Roadmap\n");
		exchange(docA, docB);
		expect(yTextToString(textB)).toBe("Roadmap\n");

		// Now BOTH peers edit concurrently before exchanging.
		// A appends a line at the end; B prepends a heading marker at the start.
		syncStringToYText(textA, "Roadmap\n- ship editor\n");
		textB.insert(0, "# ");

		exchange(docA, docB);

		// CRDT guarantee: both replicas reach the SAME state, and that state
		// contains BOTH concurrent edits (no lost update, no divergence).
		expect(yTextToString(textA)).toBe(yTextToString(textB));
		expect(yTextToString(textA)).toContain("# Roadmap");
		expect(yTextToString(textA)).toContain("- ship editor");
	});

	it("a remote edit is observable for mirroring back into local state", () => {
		const docA = new Y.Doc();
		const docB = new Y.Doc();
		const textA = docA.getText(NOTE_TEXT_KEY);
		const textB = docB.getText(NOTE_TEXT_KEY);

		// B watches for remote changes (this is what the textarea binding does to
		// push remote edits into React state).
		const seen: string[] = [];
		textB.observe(() => {
			seen.push(textB.toString());
		});

		syncStringToYText(textA, "live");
		exchange(docA, docB);

		expect(seen.at(-1)).toBe("live");
	});
});

describe("isLocalOrigin (echo suppression)", () => {
	it("tags local transactions with the binding origin and flags them", () => {
		const doc = new Y.Doc();
		const text = doc.getText(NOTE_TEXT_KEY);
		const ORIGIN = Symbol("note-binding");

		const observed: { local: boolean | null } = { local: null };
		text.observe((event) => {
			observed.local = isLocalOrigin(event.transaction, ORIGIN);
		});

		syncStringToYText(text, "typed locally", ORIGIN);
		expect(observed.local).toBe(true);
	});

	it("does not flag a foreign-origin (remote) transaction as local", () => {
		const doc = new Y.Doc();
		const text = doc.getText(NOTE_TEXT_KEY);
		const ORIGIN = Symbol("note-binding");

		const observed: { local: boolean | null } = { local: null };
		text.observe((event) => {
			observed.local = isLocalOrigin(event.transaction, ORIGIN);
		});

		// Simulate a remote apply: a transaction whose origin is NOT our binding.
		syncStringToYText(text, "from peer", Symbol("remote"));
		expect(observed.local).toBe(false);
	});
});
