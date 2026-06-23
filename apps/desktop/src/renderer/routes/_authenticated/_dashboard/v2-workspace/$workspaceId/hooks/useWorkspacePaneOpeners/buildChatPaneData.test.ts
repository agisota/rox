import { describe, expect, test } from "bun:test";
import { buildChatPaneData } from "./useWorkspacePaneOpeners";

describe("buildChatPaneData", () => {
	test("no argument → blank chat pane", () => {
		expect(buildChatPaneData()).toEqual({ sessionId: null });
	});

	test("explicit null/undefined → blank chat pane", () => {
		expect(buildChatPaneData(null)).toEqual({ sessionId: null });
		expect(buildChatPaneData(undefined)).toEqual({ sessionId: null });
	});

	test("Create PR launch config is attached to the pane", () => {
		const launchConfig = {
			initialPrompt: "/pr/create-pr",
			initialFiles: [
				{
					data: "data:text/markdown;base64,IyBQUiBjb250ZXh0",
					mediaType: "text/markdown",
					filename: "pr-context.md",
				},
			],
		};
		expect(buildChatPaneData(launchConfig)).toEqual({
			sessionId: null,
			launchConfig,
		});
	});

	test("draft Create PR prompt is preserved", () => {
		const data = buildChatPaneData({ initialPrompt: "/pr/create-pr --draft" });
		expect(data.launchConfig?.initialPrompt).toBe("/pr/create-pr --draft");
	});

	test("prompt-only launch config still attaches", () => {
		const data = buildChatPaneData({ initialPrompt: "/pr/create-pr" });
		expect(data.launchConfig).toEqual({ initialPrompt: "/pr/create-pr" });
	});

	test("a React MouseEvent leaking from onClick is ignored (blank pane)", () => {
		// `onClick={onAddChat}` passes a synthetic event as the first arg; it must
		// not be persisted as a launch config or the chat pane would auto-run it.
		const fakeEvent = {
			nativeEvent: new Event("click"),
			preventDefault: () => {},
			currentTarget: {},
			type: "click",
		} as unknown as Parameters<typeof buildChatPaneData>[0];
		expect(buildChatPaneData(fakeEvent)).toEqual({ sessionId: null });
	});

	test("a non-config object without launch keys is ignored", () => {
		const stray = { foo: "bar" } as unknown as Parameters<
			typeof buildChatPaneData
		>[0];
		expect(buildChatPaneData(stray)).toEqual({ sessionId: null });
	});
});
