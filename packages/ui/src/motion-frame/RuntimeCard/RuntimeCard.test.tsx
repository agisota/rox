import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionFrameProvider } from "../MotionFrameProvider";
import { RuntimeCard } from "./RuntimeCard";

describe("RuntimeCard", () => {
	it("renders the name, status and metrics", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider persist={false}>
				<RuntimeCard
					metrics={[
						{ id: "uptime", label: "uptime", value: "12m" },
						{ id: "tasks", label: "tasks", value: "3" },
					]}
					name="agent-runtime"
					status="running"
				/>
			</MotionFrameProvider>,
		);
		expect(html).toContain("agent-runtime");
		expect(html).toContain('data-runtime-status="running"');
		expect(html).toContain("uptime");
		expect(html).toContain("12m");
	});

	it("defaults to idle and renders children", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="off" persist={false}>
				<RuntimeCard name="r">last run: ok</RuntimeCard>
			</MotionFrameProvider>,
		);
		expect(html).toContain('data-runtime-status="idle"');
		expect(html).toContain("last run: ok");
	});
});
