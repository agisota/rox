import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Reasoning, ReasoningTrigger, reasoningLabels } from "./reasoning";

/**
 * FN-051 (#495): the chat reasoning/thinking stream header was English. The
 * product is Russian-first, so the default trigger text must render in RU and
 * never leak the old English strings.
 */
describe("reasoningLabels", () => {
	it("ships Russian copy (no English leakage)", () => {
		expect(reasoningLabels.thinking).toBe("Размышляю…");
		expect(reasoningLabels.thoughtForAWhile).toBe(
			"Размышление заняло несколько секунд",
		);
		expect(reasoningLabels.thoughtForSeconds(7)).toBe("Размышление · 7 сек.");
	});

	it("never contains the old English strings", () => {
		const blob = JSON.stringify({
			a: reasoningLabels.thinking,
			b: reasoningLabels.thoughtForAWhile,
			c: reasoningLabels.thoughtForSeconds(3),
		});
		expect(blob).not.toContain("Thinking");
		expect(blob).not.toContain("Thought for");
	});
});

describe("ReasoningTrigger default copy", () => {
	it("renders the RU streaming label while streaming", () => {
		const html = renderToStaticMarkup(
			<Reasoning isStreaming open>
				<ReasoningTrigger />
			</Reasoning>,
		);
		expect(html).toContain("Размышляю");
		expect(html).not.toContain("Thinking");
	});

	it("renders the RU elapsed label after streaming", () => {
		const html = renderToStaticMarkup(
			<Reasoning isStreaming={false} open duration={5}>
				<ReasoningTrigger />
			</Reasoning>,
		);
		expect(html).toContain("Размышление");
		expect(html).toContain("5");
		expect(html).not.toContain("Thought for");
	});
});
