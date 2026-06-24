import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Reasoning } from "./reasoning";
import { Tool, ToolHeader } from "./tool";
import {
	ToolGroup,
	ToolGroupContext,
	type ToolGroupContextValue,
	ToolGroupExpandAll,
	useToolGroup,
	useToolGroupItem,
} from "./tool-group";

/** Builds a complete context value, overriding only what a test cares about. */
function makeGroupValue(
	overrides: Partial<ToolGroupContextValue> = {},
): ToolGroupContextValue {
	return {
		broadcast: { open: false, epoch: 0 },
		expandAll: () => {},
		collapseAll: () => {},
		setItemOpen: () => {},
		itemCount: 0,
		openCount: 0,
		...overrides,
	};
}

/** Probe that surfaces a card's derived open state into static markup. */
function OpenProbe({ defaultOpen }: { defaultOpen?: boolean }) {
	const { open } = useToolGroupItem(defaultOpen ? { defaultOpen } : {});
	return <span data-open={open ? "yes" : "no"} />;
}

describe("useToolGroupItem", () => {
	it("seeds open from the card's own defaultOpen when standalone", () => {
		expect(renderToStaticMarkup(<OpenProbe defaultOpen />)).toContain(
			'data-open="yes"',
		);
		expect(renderToStaticMarkup(<OpenProbe />)).toContain('data-open="no"');
	});

	it("keeps the card's own default on initial render inside a group", () => {
		// Group default is collapsed; a card declaring defaultOpen stays open until
		// an explicit broadcast — native per-card defaults survive the group.
		const html = renderToStaticMarkup(
			<ToolGroup>
				<OpenProbe defaultOpen />
			</ToolGroup>,
		);
		expect(html).toContain('data-open="yes"');
	});

	it("follows a broadcast whose epoch is already ahead at first render", () => {
		// epoch advanced past the card's initial seen epoch (-1 standalone, but the
		// real provider starts items at the current epoch). Supplying a context
		// whose epoch is ahead proves the render-phase override drives open.
		const html = renderToStaticMarkup(
			<ToolGroupContext.Provider
				value={makeGroupValue({ broadcast: { open: true, epoch: 5 } })}
			>
				<OpenProbe />
			</ToolGroupContext.Provider>,
		);
		expect(html).toContain('data-open="yes"');
	});

	it("follows a collapse broadcast over a card that defaulted open", () => {
		const html = renderToStaticMarkup(
			<ToolGroupContext.Provider
				value={makeGroupValue({ broadcast: { open: false, epoch: 3 } })}
			>
				<OpenProbe defaultOpen />
			</ToolGroupContext.Provider>,
		);
		expect(html).toContain('data-open="no"');
	});
});

describe("Tool group integration", () => {
	it("threads a controlled open prop through the group-aware Tool", () => {
		const html = renderToStaticMarkup(
			<Tool open>
				<ToolHeader state="output-available" title="ran" />
			</Tool>,
		);
		// Radix Collapsible reflects controlled open state into data-state.
		expect(html).toContain('data-state="open"');
	});

	it("renders a group Tool collapsed by default (card default wins)", () => {
		const html = renderToStaticMarkup(
			<ToolGroup>
				<Tool>
					<ToolHeader state="output-available" title="ran" />
				</Tool>
			</ToolGroup>,
		);
		expect(html).toContain('data-state="closed"');
	});

	it("drives a group Tool open via a context broadcast at first render", () => {
		const html = renderToStaticMarkup(
			<ToolGroupContext.Provider
				value={makeGroupValue({ broadcast: { open: true, epoch: 1 } })}
			>
				<Tool>
					<ToolHeader state="output-available" title="ran" />
				</Tool>
			</ToolGroupContext.Provider>,
		);
		expect(html).toContain('data-state="open"');
	});

	it("preserves Reasoning's native open-by-default inside a group", () => {
		const html = renderToStaticMarkup(
			<ToolGroup>
				<Reasoning>{"thinking out loud"}</Reasoning>
			</ToolGroup>,
		);
		expect(html).toContain('data-state="open"');
	});

	it("drives Reasoning closed via a collapse broadcast", () => {
		const html = renderToStaticMarkup(
			<ToolGroupContext.Provider
				value={makeGroupValue({ broadcast: { open: false, epoch: 2 } })}
			>
				<Reasoning>{"thinking out loud"}</Reasoning>
			</ToolGroupContext.Provider>,
		);
		expect(html).toContain('data-state="closed"');
	});
});

describe("ToolGroupExpandAll", () => {
	it("renders nothing without a surrounding group", () => {
		expect(renderToStaticMarkup(<ToolGroupExpandAll />)).toBe("");
	});

	it("renders nothing when the group has no member cards", () => {
		const html = renderToStaticMarkup(
			<ToolGroupContext.Provider value={makeGroupValue({ itemCount: 0 })}>
				<ToolGroupExpandAll />
			</ToolGroupContext.Provider>,
		);
		expect(html).toBe("");
	});

	it("offers Expand all when every member card is collapsed", () => {
		const html = renderToStaticMarkup(
			<ToolGroupContext.Provider
				value={makeGroupValue({ itemCount: 3, openCount: 0 })}
			>
				<ToolGroupExpandAll />
			</ToolGroupContext.Provider>,
		);
		expect(html).toContain("Expand all");
		expect(html).not.toContain("Collapse all");
	});

	it("offers Collapse all once any member card is open", () => {
		const html = renderToStaticMarkup(
			<ToolGroupContext.Provider
				value={makeGroupValue({ itemCount: 3, openCount: 1 })}
			>
				<ToolGroupExpandAll />
			</ToolGroupContext.Provider>,
		);
		expect(html).toContain("Collapse all");
	});

	it("honors custom labels", () => {
		const html = renderToStaticMarkup(
			<ToolGroupContext.Provider
				value={makeGroupValue({ itemCount: 1, openCount: 0 })}
			>
				<ToolGroupExpandAll expandLabel="Открыть всё" />
			</ToolGroupContext.Provider>,
		);
		expect(html).toContain("Открыть всё");
	});
});

describe("useToolGroup", () => {
	it("returns null when there is no surrounding group", () => {
		function NullProbe() {
			const group = useToolGroup();
			return <span data-grouped={group ? "yes" : "no"} />;
		}
		expect(renderToStaticMarkup(<NullProbe />)).toContain('data-grouped="no"');
	});
});
