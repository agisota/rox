import { describe, expect, mock, test } from "bun:test";
import type {
	BranchSyncStatus,
	PRFlowState,
} from "../../components/PRActionHeader/utils/getPRFlowState";
import {
	buildCreatePRLaunch,
	type OpenChatFn,
	planDispatch,
} from "./usePRFlowDispatch";

const sync: BranchSyncStatus = {
	hasRepo: true,
	hasUpstream: true,
	pushCount: 1,
	pullCount: 0,
	isDefaultBranch: false,
	isDetached: false,
	hasUncommitted: false,
	currentBranch: "feature-x",
	defaultBranch: "main",
};

const noPrState: PRFlowState = { kind: "no-pr", sync };

describe("planDispatch", () => {
	test("no-pr without draft → /pr/create-pr prompt", () => {
		const plan = planDispatch(noPrState, { draft: false });
		expect(plan).not.toBeNull();
		expect(plan?.prompt).toBe("/pr/create-pr");
	});

	test("no-pr with draft → /pr/create-pr --draft", () => {
		const plan = planDispatch(noPrState, { draft: true });
		expect(plan?.prompt).toBe("/pr/create-pr --draft");
	});

	test("attaches pr-context.md as base64 data URL", () => {
		const plan = planDispatch(noPrState, { draft: false });
		expect(plan?.attachment.filename).toBe("pr-context.md");
		expect(plan?.attachment.mediaType).toBe("text/markdown");
		expect(plan?.attachment.data.startsWith("data:text/markdown;base64,")).toBe(
			true,
		);

		const base64 = plan?.attachment.data.replace(
			"data:text/markdown;base64,",
			"",
		);
		const decoded = Buffer.from(base64 ?? "", "base64").toString("utf-8");
		expect(decoded).toContain("# PR context");
		expect(decoded).toContain("Current: `feature-x`");
	});

	test("returns null for states outside MVP scope", () => {
		expect(planDispatch({ kind: "loading" }, { draft: false })).toBeNull();
		expect(
			planDispatch({ kind: "busy", pr: null }, { draft: false }),
		).toBeNull();
		expect(
			planDispatch(
				{ kind: "unavailable", reason: "default-branch" },
				{ draft: false },
			),
		).toBeNull();
	});
});

describe("buildCreatePRLaunch", () => {
	test("no-pr → launch config with prompt + pr-context.md attachment", () => {
		const launch = buildCreatePRLaunch(noPrState, { draft: false });
		expect(launch).not.toBeNull();
		expect(launch?.initialPrompt).toBe("/pr/create-pr");
		expect(launch?.initialFiles).toHaveLength(1);
		expect(launch?.initialFiles[0]?.filename).toBe("pr-context.md");
		expect(launch?.initialFiles[0]?.mediaType).toBe("text/markdown");
	});

	test("draft flag flows through to the prompt", () => {
		const launch = buildCreatePRLaunch(noPrState, { draft: true });
		expect(launch?.initialPrompt).toBe("/pr/create-pr --draft");
	});

	test("non-dispatchable states return null", () => {
		expect(
			buildCreatePRLaunch({ kind: "loading" }, { draft: false }),
		).toBeNull();
		expect(
			buildCreatePRLaunch({ kind: "busy", pr: null }, { draft: false }),
		).toBeNull();
	});
});

describe("create handler (dispatch → onOpenChat)", () => {
	test("dispatching a no-pr create opens chat with the launch config", () => {
		const onOpenChat = mock<OpenChatFn>(() => {});
		// Mirror the hook body without rendering: the hook is a thin wrapper that
		// forwards `buildCreatePRLaunch(...)` into `onOpenChat`.
		const launch = buildCreatePRLaunch(noPrState, { draft: false });
		if (launch) onOpenChat(launch);

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		const arg = onOpenChat.mock.calls[0]?.[0];
		expect(arg?.initialPrompt).toBe("/pr/create-pr");
		expect(arg?.initialFiles?.[0]?.filename).toBe("pr-context.md");
	});

	test("dispatching a non-creatable state never calls onOpenChat", () => {
		const onOpenChat = mock<OpenChatFn>(() => {});
		const launch = buildCreatePRLaunch(
			{ kind: "unavailable", reason: "default-branch" },
			{ draft: false },
		);
		if (launch) onOpenChat(launch);

		expect(onOpenChat).not.toHaveBeenCalled();
	});
});
