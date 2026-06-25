import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { setMotionPreferenceSource } from "../../motion";
import { EmptyState, type EmptyStateChip } from "./EmptyState";

function setPreference(value: "full" | "essential" | "off") {
	setMotionPreferenceSource({
		getSnapshot: () => value,
		subscribe: () => () => {},
	});
}

afterEach(() => {
	setMotionPreferenceSource({
		getSnapshot: () => "full",
		subscribe: () => () => {},
	});
});

const chips: EmptyStateChip[] = [
	{ id: "a", label: "Загрузить", onSelect: () => {} },
	{ id: "b", label: "Папка", onSelect: () => {} },
];

describe("EmptyState", () => {
	it("renders title, description and a chip per action", () => {
		setPreference("full");
		const html = renderToStaticMarkup(
			<EmptyState
				title="Здесь пока пусто"
				description="Перетащите файлы"
				chips={chips}
			/>,
		);
		expect(html).toContain("Здесь пока пусто");
		expect(html).toContain("Перетащите файлы");
		expect(html).toContain("Загрузить");
		expect(html).toContain("Папка");
	});

	it("renders skeleton chips while suggestions load", () => {
		setPreference("full");
		const html = renderToStaticMarkup(<EmptyState title="x" chipsLoading />);
		expect(html).toContain("animate-pulse");
	});

	it("renders the same content under reduced motion (off)", () => {
		setPreference("off");
		const html = renderToStaticMarkup(
			<EmptyState title="Здесь пока пусто" chips={chips} />,
		);
		// Final state is always present regardless of the motion gate.
		expect(html).toContain("Здесь пока пусто");
		expect(html).toContain("Загрузить");
	});

	it("omits the chip row when there are no chips", () => {
		setPreference("full");
		const html = renderToStaticMarkup(<EmptyState title="Пусто" />);
		expect(html).toContain("Пусто");
		expect(html).not.toContain("animate-pulse");
	});
});
