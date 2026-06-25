import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FilePanelHeader } from "./FilePanelHeader";

const TABS = [
	{ id: "files", label: "Файлы" },
	{ id: "artifacts", label: "Артефакты", count: 3 },
	{ id: "todos", label: "Задачи" },
];

describe("FilePanelHeader", () => {
	it("renders the breadcrumb root crumb", () => {
		const html = renderToStaticMarkup(
			<FilePanelHeader
				breadcrumb={[{ id: "root", label: "Workspace" }]}
				tabs={TABS}
				activeTab="files"
				onTabChange={() => {}}
			/>,
		);
		expect(html).toContain("Workspace");
	});

	it("renders all three tabs with the artifacts count", () => {
		const html = renderToStaticMarkup(
			<FilePanelHeader
				breadcrumb={[{ id: "root", label: "Workspace" }]}
				tabs={TABS}
				activeTab="files"
				onTabChange={() => {}}
			/>,
		);
		expect(html).toContain("Файлы");
		expect(html).toContain("Артефакты");
		expect(html).toContain("Задачи");
		expect(html).toContain("(3)");
	});

	it("omits the count when it is zero", () => {
		const html = renderToStaticMarkup(
			<FilePanelHeader
				breadcrumb={[{ id: "root", label: "Workspace" }]}
				tabs={[{ id: "artifacts", label: "Артефакты", count: 0 }]}
				activeTab="artifacts"
				onTabChange={() => {}}
			/>,
		);
		expect(html).not.toContain("(0)");
	});

	it("clamps large counts to 99+", () => {
		const html = renderToStaticMarkup(
			<FilePanelHeader
				breadcrumb={[{ id: "root", label: "Workspace" }]}
				tabs={[{ id: "artifacts", label: "Артефакты", count: 250 }]}
				activeTab="artifacts"
				onTabChange={() => {}}
			/>,
		);
		expect(html).toContain("(99+)");
	});

	it("marks the active tab via aria-selected", () => {
		const html = renderToStaticMarkup(
			<FilePanelHeader
				breadcrumb={[{ id: "root", label: "Workspace" }]}
				tabs={TABS}
				activeTab="artifacts"
				onTabChange={() => {}}
			/>,
		);
		expect(html).toContain('aria-selected="true"');
	});

	it("renders the hidden indicator and git badge when supplied", () => {
		const html = renderToStaticMarkup(
			<FilePanelHeader
				breadcrumb={[{ id: "root", label: "Workspace" }]}
				hiddenIndicator
				gitBadge="main"
				tabs={TABS}
				activeTab="files"
				onTabChange={() => {}}
			/>,
		);
		expect(html).toContain("main");
		expect(html).toContain("Скрытые элементы");
	});
});
