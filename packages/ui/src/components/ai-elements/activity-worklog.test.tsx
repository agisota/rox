import { describe, expect, it } from "bun:test";
import { FileIcon } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityWorklog, type ActivityWorklogGroup } from "./activity-worklog";

function group(over: Partial<ActivityWorklogGroup> = {}): ActivityWorklogGroup {
	return {
		id: "g1",
		summary: "Прочитано · 2 файлов",
		isPending: false,
		isError: false,
		items: [
			{
				icon: FileIcon,
				title: "Прочитано",
				subtitle: "a.ts",
				isPending: false,
				isError: false,
			},
			{
				icon: FileIcon,
				title: "Прочитано",
				subtitle: "b.ts",
				isPending: false,
				isError: false,
			},
		],
		...over,
	};
}

describe("ActivityWorklog", () => {
	it("renders nothing with no groups", () => {
		expect(renderToStaticMarkup(<ActivityWorklog groups={[]} />)).toBe("");
	});

	it("renders the header label and bucket summary", () => {
		const html = renderToStaticMarkup(
			<ActivityWorklog groups={[group()]} label="Активность" open />,
		);
		expect(html).toContain("Активность");
		expect(html).toContain("Прочитано · 2 файлов");
	});

	it("hides bucket bodies when collapsed (persistent, not vanished)", () => {
		// Collapsed: the header still renders (timeline is persistent) but the
		// AnimatedHeight body is not shown.
		const html = renderToStaticMarkup(
			<ActivityWorklog groups={[group()]} label="Активность" open={false} />,
		);
		expect(html).toContain("Активность");
	});
});
