import { describe, expect, it } from "bun:test";
import { deriveQuestionDisplayState } from "./deriveQuestionDisplayState";

describe("deriveQuestionDisplayState", () => {
	it("is pending while the part is still streaming and not interrupted", () => {
		const state = deriveQuestionDisplayState({
			partState: "input-streaming",
			isResultError: false,
			isInterrupted: false,
			hasAnswers: false,
		});
		expect(state.status).toBe("pending");
		expect(state.isPending).toBe(true);
		expect(state.isCancelled).toBe(false);
		expect(state.showAbortedRows).toBe(false);
	});

	it("is pending while awaiting user input (input-available)", () => {
		const state = deriveQuestionDisplayState({
			partState: "input-available",
			isResultError: false,
			isInterrupted: false,
			hasAnswers: false,
		});
		expect(state.status).toBe("pending");
		expect(state.isPending).toBe(true);
	});

	it("is answered when terminal with answers and no error", () => {
		const state = deriveQuestionDisplayState({
			partState: "output-available",
			isResultError: false,
			isInterrupted: false,
			hasAnswers: true,
		});
		expect(state.status).toBe("answered");
		expect(state.isAnswered).toBe(true);
		expect(state.isCancelled).toBe(false);
		expect(state.showAbortedRows).toBe(false);
	});

	it("keeps loud 'Aborted by the user' rows when the user explicitly stops the run", () => {
		const state = deriveQuestionDisplayState({
			partState: "input-available",
			isResultError: false,
			isInterrupted: true,
			hasAnswers: false,
		});
		expect(state.status).toBe("interrupted");
		expect(state.isPending).toBe(false);
		expect(state.isCancelled).toBe(true);
		// Genuine cancel: preserve the honest destructive treatment.
		expect(state.showAbortedRows).toBe(true);
	});

	it("keeps loud rows when an interrupt also produced an error result", () => {
		const state = deriveQuestionDisplayState({
			partState: "output-error",
			isResultError: true,
			isInterrupted: true,
			hasAnswers: false,
		});
		expect(state.status).toBe("interrupted");
		expect(state.showAbortedRows).toBe(true);
	});

	it("collapses an auto-aborted question (user continued the conversation) to a quiet state", () => {
		// mastracode emits { isError: true } when a fresh turn supersedes the
		// pending question. No explicit interrupt => this is the confusing-clutter
		// case the bug is about. It must NOT show destructive 'Aborted' rows.
		const state = deriveQuestionDisplayState({
			partState: "output-error",
			isResultError: true,
			isInterrupted: false,
			hasAnswers: false,
		});
		expect(state.status).toBe("superseded");
		expect(state.isPending).toBe(false);
		expect(state.isCancelled).toBe(true);
		expect(state.showAbortedRows).toBe(false);
	});

	it("treats a terminal error-state part without answers as superseded (quiet)", () => {
		const state = deriveQuestionDisplayState({
			partState: "output-error",
			isResultError: false,
			isInterrupted: false,
			hasAnswers: false,
		});
		expect(state.status).toBe("superseded");
		expect(state.showAbortedRows).toBe(false);
	});

	it("prefers answered over error when answers are present and no interrupt", () => {
		// Defensive: a stray isError:false terminal with answers stays 'answered'.
		const state = deriveQuestionDisplayState({
			partState: "output-available",
			isResultError: false,
			isInterrupted: false,
			hasAnswers: true,
		});
		expect(state.status).toBe("answered");
	});

	it("an errored result with answers is still treated as superseded, not answered", () => {
		// If mastracode flagged the result as an error we do not trust partial
		// answer text — the question did not complete normally.
		const state = deriveQuestionDisplayState({
			partState: "output-error",
			isResultError: true,
			isInterrupted: false,
			hasAnswers: true,
		});
		expect(state.status).toBe("superseded");
		expect(state.isAnswered).toBe(false);
	});
});
