import { afterEach, describe, expect, test } from "bun:test";
import {
	__resetComposerCountForTests,
	appendInsertedText,
	dispatchInsert,
	hasActiveComposer,
	INSERT_PROMPT_EVENT,
	type InsertPromptDetail,
	markComposerActive,
} from "./use-insert-prompt";

afterEach(() => {
	__resetComposerCountForTests();
});

describe("appendInsertedText", () => {
	test("returns the prompt verbatim when the draft is empty", () => {
		expect(appendInsertedText("", "hello")).toBe("hello");
	});

	test("appends after a newline when a draft is in progress", () => {
		expect(appendInsertedText("draft", "added")).toBe("draft\nadded");
	});
});

describe("markComposerActive refcount", () => {
	test("starts with no active composer", () => {
		expect(hasActiveComposer()).toBe(false);
	});

	test("tracks multiple composers and never goes negative", () => {
		markComposerActive(true);
		markComposerActive(true);
		expect(hasActiveComposer()).toBe(true);
		markComposerActive(false);
		expect(hasActiveComposer()).toBe(true);
		markComposerActive(false);
		expect(hasActiveComposer()).toBe(false);
		// Extra blur (e.g. unmount race) must not drive the count below zero.
		markComposerActive(false);
		expect(hasActiveComposer()).toBe(false);
	});
});

describe("dispatchInsert (insert seam)", () => {
	test("reports no-target and dispatches nothing when no composer is active", () => {
		const received: InsertPromptDetail[] = [];
		const listener = (e: Event) => {
			received.push((e as CustomEvent<InsertPromptDetail>).detail);
		};
		globalThis.addEventListener(INSERT_PROMPT_EVENT, listener);
		try {
			expect(dispatchInsert("hi").mode).toBe("no-target");
			expect(received).toHaveLength(0);
		} finally {
			globalThis.removeEventListener(INSERT_PROMPT_EVENT, listener);
		}
	});

	test("delivers text + cursor in-place to an active composer", () => {
		const received: InsertPromptDetail[] = [];
		const listener = (e: Event) => {
			received.push((e as CustomEvent<InsertPromptDetail>).detail);
		};
		globalThis.addEventListener(INSERT_PROMPT_EVENT, listener);
		markComposerActive(true);
		try {
			expect(dispatchInsert({ text: "filled", cursor: 3 }).mode).toBe(
				"in-place",
			);
			expect(received).toEqual([{ text: "filled", cursor: 3 }]);
		} finally {
			globalThis.removeEventListener(INSERT_PROMPT_EVENT, listener);
		}
	});

	test("accepts a bare string payload (⌘K quick-insert path)", () => {
		const received: InsertPromptDetail[] = [];
		const listener = (e: Event) => {
			received.push((e as CustomEvent<InsertPromptDetail>).detail);
		};
		globalThis.addEventListener(INSERT_PROMPT_EVENT, listener);
		markComposerActive(true);
		try {
			dispatchInsert("bare");
			expect(received).toEqual([{ text: "bare" }]);
		} finally {
			globalThis.removeEventListener(INSERT_PROMPT_EVENT, listener);
		}
	});
});
