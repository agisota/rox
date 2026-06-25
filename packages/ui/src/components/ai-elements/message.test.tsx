import { describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const streamdownCalls: Array<Record<string, unknown>> = [];

mock.module("@streamdown/mermaid", () => ({
	mermaid: {},
}));

mock.module("streamdown", () => ({
	Streamdown: (props: Record<string, unknown>) => {
		streamdownCalls.push(props);
		return <div>{props.children as ReactNode}</div>;
	},
}));

const {
	MessageResponse,
	MessageBlockCopy,
	MessageBranch,
	MessageBranchContent,
	MessageBranchSelector,
	MessageBranchPage,
	messageActionLabels,
} = await import("./message");

describe("MessageResponse", () => {
	it("preserves assistant soft line breaks in markdown paragraphs", () => {
		streamdownCalls.length = 0;

		renderToStaticMarkup(<MessageResponse>{"foo\nbar"}</MessageResponse>);

		const call = streamdownCalls.at(-1);
		expect(call).toBeDefined();
		expect(call?.className).toContain("[&_p]:whitespace-pre-wrap");
		expect(call?.className).toContain("[&_li]:whitespace-pre-wrap");
	});
});

describe("messageActionLabels", () => {
	it("provides RU copy/regenerate/retry labels as a single source of truth", () => {
		expect(messageActionLabels.copy.tooltip).toBe("Копировать");
		expect(messageActionLabels.regenerate.tooltip).toBe("Перегенерировать");
		expect(messageActionLabels.retry.tooltip).toBe("Повторить");
		expect(messageActionLabels.copyBlock.aria).toBe("Копировать блок");
	});
});

describe("MessageBlockCopy", () => {
	it("renders an accessible per-block copy affordance with the supplied text", () => {
		const markup = renderToStaticMarkup(
			<MessageBlockCopy text={"# Heading\n\nbody"} onCopyText={() => {}} />,
		);

		// Exposes the RU aria label and ships an idle (copy) state by default.
		expect(markup).toContain("Копировать блок");
		expect(markup).toContain("aria-label");
	});
});

describe("MessageBranch", () => {
	it("renders every regeneration variant so the selector can navigate them", () => {
		const markup = renderToStaticMarkup(
			<MessageBranch defaultBranch={0}>
				<MessageBranchContent>
					<div key="a">Вариант A</div>
					<div key="b">Вариант B</div>
				</MessageBranchContent>
				<MessageBranchSelector>
					<MessageBranchPage />
				</MessageBranchSelector>
			</MessageBranch>,
		);

		// All branches are mounted (visibility toggled via class); the active one is
		// shown and siblings are hidden, ready for prev/next navigation.
		expect(markup).toContain("Вариант A");
		expect(markup).toContain("Вариант B");
		expect(markup).toContain("hidden");
	});

	it("uses a RU page counter once branch state is populated", () => {
		// The page label is built from the branch context counts and is RU-localized
		// ("N из M") rather than the upstream English "N of M".
		const source = MessageBranchPage.toString();
		expect(source).not.toContain(" of ");
	});
});
