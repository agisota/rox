import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TeamCard } from "./TeamCard";

describe("TeamCard", () => {
	it("renders name and subtitle", () => {
		const html = renderToStaticMarkup(
			<TeamCard name="Платформа" subtitle="Создана 1 янв." />,
		);
		expect(html).toContain("Платформа");
		expect(html).toContain("Создана 1 янв.");
	});

	it("renders a button when onClick is provided", () => {
		const html = renderToStaticMarkup(
			<TeamCard name="Платформа" onClick={() => {}} />,
		);
		expect(html).toContain("<button");
	});

	it("renders a div when not interactive", () => {
		const html = renderToStaticMarkup(<TeamCard name="Платформа" />);
		expect(html).not.toContain("<button");
	});
});
