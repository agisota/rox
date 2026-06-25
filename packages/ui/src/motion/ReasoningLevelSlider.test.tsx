import { describe, expect, it } from "bun:test";
import type { ThinkingLevel } from "@rox/ui/ai-elements/thinking-toggle";
import { renderToStaticMarkup } from "react-dom/server";
import { ReasoningLevelSlider } from "./ReasoningLevelSlider";

/**
 * #518: the reasoning-effort slider was redesigned (glass segments, animated
 * marker). These tests pin the load-bearing behavior the redesign must keep:
 * all five RU levels, radiogroup a11y, and a correctly-marked selection.
 */
describe("ReasoningLevelSlider", () => {
	const render = (level: ThinkingLevel) =>
		renderToStaticMarkup(
			<ReasoningLevelSlider level={level} onLevelChange={() => {}} />,
		);

	it("renders all five RU reasoning levels", () => {
		const html = render("medium");
		for (const label of ["Выкл", "Низкий", "Средний", "Высокий", "Макс"]) {
			expect(html).toContain(label);
		}
	});

	it("exposes radiogroup semantics for accessibility", () => {
		const html = render("off");
		expect(html).toContain('role="radiogroup"');
		expect(html).toContain('role="radio"');
		expect(html).toContain('aria-label="Уровень размышления модели"');
	});

	it("marks exactly the selected segment as checked", () => {
		const html = render("high");
		const checkedCount = (html.match(/aria-checked="true"/g) ?? []).length;
		expect(checkedCount).toBe(1);
	});

	it("keeps the brain reasoning-effort affordance labelled", () => {
		const html = render("xhigh");
		expect(html).toContain('aria-label="Уровень рассуждения"');
	});
});
