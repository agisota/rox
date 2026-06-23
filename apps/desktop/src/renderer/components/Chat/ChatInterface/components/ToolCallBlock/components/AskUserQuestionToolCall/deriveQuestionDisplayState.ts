import type { ToolPart } from "../../../../utils/tool-helpers";

/**
 * Terminal-state reducer for an `ask_user_question` tool part.
 *
 * Pure and unit-testable: it turns the raw render inputs (tool part state,
 * mastracode result shape, interrupt flag, parsed answers) into a single
 * discriminated view of how the question card should render. Keeping this out
 * of the component lets us test the tricky cancel/abort branches without React.
 *
 * The important product distinction is *why* a question is no longer pending:
 *
 *  - `answered`   — the user picked an option / typed a reply. Show the Q&A.
 *  - `interrupted`— the user explicitly stopped the run (Stop button / `/stop`),
 *                   so the in-flight question was torn down. This is a *real*
 *                   cancellation and keeps the loud "Aborted by the user" rows.
 *  - `superseded` — the user simply continued the conversation (sent a new
 *                   message, dictated, etc.). mastracode aborts the pending
 *                   `ask_user_question` as a side effect and emits
 *                   `{ isError: true }`. Faithfully painting that as a full
 *                   "Вопрос — ОТМЕНЕНО / Aborted by the user" card is the bug:
 *                   it reads as an error and clutters the transcript. We collapse
 *                   it to a quiet, single muted line instead.
 *  - `pending`    — still awaiting the user.
 *
 * NOTE: mastracode sends `{ isError: true, content: "..." }` for an aborted
 * question (see AskUserQuestionToolCall.tsx). `isError` alone cannot tell us
 * *which* kind of abort it was, so we lean on the renderer-observable
 * `isInterrupted` signal (true only when the assistant turn was captured as an
 * explicitly-stopped/interrupted message) to separate a deliberate Stop from an
 * auto-abort caused by continuing the conversation.
 */
export type QuestionDisplayStatus =
	| "pending"
	| "answered"
	| "interrupted"
	| "superseded";

export interface DeriveQuestionDisplayStateInput {
	/** Raw tool part — its `state` drives terminal detection. */
	partState: ToolPart["state"];
	/** mastracode marks aborted questions with `{ isError: true }`. */
	isResultError: boolean;
	/** True when the assistant turn was explicitly stopped by the user. */
	isInterrupted: boolean;
	/** True when at least one answer (structured or fallback text) is present. */
	hasAnswers: boolean;
}

export interface QuestionDisplayState {
	status: QuestionDisplayStatus;
	/** Convenience flags for the renderer. */
	isPending: boolean;
	isAnswered: boolean;
	/** Any terminal "not answered" state (interrupted OR superseded). */
	isCancelled: boolean;
	/**
	 * Only the *explicit* cancel (Stop) should show the loud per-question
	 * "Aborted by the user" destructive rows. A superseded question renders a
	 * single quiet muted badge with no destructive rows.
	 */
	showAbortedRows: boolean;
}

function isTerminalPartState(partState: ToolPart["state"]): boolean {
	return partState === "output-available" || partState === "output-error";
}

export function deriveQuestionDisplayState({
	partState,
	isResultError,
	isInterrupted,
	hasAnswers,
}: DeriveQuestionDisplayStateInput): QuestionDisplayState {
	const errored = partState === "output-error" || isResultError;

	// A question is still pending only when it has not reached a terminal part
	// state AND was not torn down by an explicit interrupt.
	const reachedTerminal = isTerminalPartState(partState) || errored;
	const isPending = !reachedTerminal && !isInterrupted;

	if (isPending) {
		return {
			status: "pending",
			isPending: true,
			isAnswered: false,
			isCancelled: false,
			showAbortedRows: false,
		};
	}

	// Answered: terminal, not an error, and we actually have answer content.
	if (!errored && !isInterrupted && hasAnswers) {
		return {
			status: "answered",
			isPending: false,
			isAnswered: true,
			isCancelled: false,
			showAbortedRows: false,
		};
	}

	// Explicit Stop wins: keep the loud, honest "Aborted by the user" treatment.
	if (isInterrupted) {
		return {
			status: "interrupted",
			isPending: false,
			isAnswered: false,
			isCancelled: true,
			showAbortedRows: true,
		};
	}

	// Otherwise the question was auto-aborted because the user continued the
	// conversation (errored result, no explicit interrupt). Render it quietly so
	// the transcript is not littered with confusing cancelled-question cards.
	return {
		status: "superseded",
		isPending: false,
		isAnswered: false,
		isCancelled: true,
		showAbortedRows: false,
	};
}
