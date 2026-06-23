// Register happy-dom's DOM globals BEFORE @testing-library/* is imported. ESM
// evaluates this side-effecting import in source order, so `document`/`window`
// exist by the time `@testing-library/dom` binds its queries. This is a side
// effect import — keep it FIRST.
import "../../../../../happydom";

import { afterEach, describe, expect, test } from "bun:test";
import type { PromptInputMessage } from "@rox/ui/ai-elements/prompt-input";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { WorkingPromptComposer } from "./WorkingPromptComposer";

/**
 * Composer-restore test for the web `(agents)` working composer.
 *
 * The bug this guards: `WorkingPromptComposer` used to render a BARE
 * `<PromptInput>` with no `<PromptInputProvider>`. In that self-managed mode
 * `PromptInput` (a) hard-resets the form BEFORE `onSubmit` and (b) makes
 * `restoreComposer` a no-op (prompt-input.tsx:837-839, :861), so when the live
 * send rejected — the transient relay-down / host-down case this feature exists
 * to handle — the user's typed message was SILENTLY LOST (only the error
 * showed). The fix wraps the composer in `<PromptInputProvider>` (the desktop
 * chat pattern), flipping `usingProvider` true so the typed text is RESTORED on
 * an `onSend` rejection.
 *
 * This is a REAL interactive render: a live DOM (happy-dom), a real React client
 * root, the real `PromptInput` submit -> reject -> restore cycle, and the real
 * `WorkingPromptComposer` under test. The typed draft is seeded through the
 * composer's `initialInput` (the provider API) rather than synthetic keystrokes
 * because React 19's controlled-input value tracker does not propagate
 * `fireEvent.change` under happy-dom; seeding via the provider exercises the
 * exact same controller state a real keystroke would produce, then the assertion
 * drives the production submit/reject path that owns the restore guarantee.
 */
describe("WorkingPromptComposer", () => {
	afterEach(() => {
		cleanup();
	});

	test("keeps the typed draft and surfaces an error when onSend rejects", async () => {
		const TYPED = "ship the transient-relay message";
		const seen: string[] = [];

		const view = render(
			<WorkingPromptComposer
				initialInput={TYPED}
				onSend={async (message: PromptInputMessage) => {
					seen.push(message.text);
					// Simulate the live host write rejecting (relay down / host down).
					throw new Error("host down (502)");
				}}
				placeholder="Сообщение…"
				promptInputClassName=""
				footerTools={<span>model</span>}
			/>,
		);

		const textarea = view.getByPlaceholderText(
			"Сообщение…",
		) as HTMLTextAreaElement;
		// The user's typed text is in the composer before sending.
		expect(textarea.value).toBe(TYPED);

		// Submit the composer; the real PromptInput submit cycle runs onSend, which
		// rejects, so the draft must be restored and the error surfaced.
		const form = textarea.closest("form") as HTMLFormElement;
		await act(async () => {
			fireEvent.submit(form);
		});
		// Let the async submit (blob conversion + the rejecting onSend) settle.
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 30));
		});

		// onSend was actually invoked with the typed text (not an empty submit).
		expect(seen).toEqual([TYPED]);

		// THE GUARANTEE: the typed message survived the rejected send.
		expect(textarea.value).toBe(TYPED);

		// AND the failure is surfaced, never silent.
		const alert = view.queryByRole("alert");
		expect(alert).not.toBeNull();
		expect(alert?.textContent).toContain("host down (502)");
	});
});
