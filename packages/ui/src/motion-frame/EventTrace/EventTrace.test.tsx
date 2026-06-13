import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionFrameProvider } from "../MotionFrameProvider";
import { EventTrace } from "./EventTrace";

const EVENTS = [
	{ id: "received", label: "event.received", status: "done" as const },
	{ id: "written", label: "diff.written", status: "active" as const },
	{ id: "passed", label: "validator.passed", status: "pending" as const },
];

describe("EventTrace", () => {
	it("renders each event with its status token marker", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider persist={false}>
				<EventTrace events={EVENTS} />
			</MotionFrameProvider>,
		);
		expect(html).toContain("event.received");
		expect(html).toContain("diff.written");
		expect(html).toContain("validator.passed");
		expect(html).toContain('data-event-status="done"');
		expect(html).toContain('data-event-status="active"');
		expect(html).toContain('data-event-status="pending"');
	});

	it("renders details and stays visible when motion is off", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="off" persist={false}>
				<EventTrace
					events={[
						{ id: "a", label: "event.received", detail: "payload: 2kb" },
					]}
				/>
			</MotionFrameProvider>,
		);
		expect(html).toContain("payload: 2kb");
		expect(html).toContain('data-event-status="pending"');
	});
});
