import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
	type LiveRoomActivity,
	LiveRoomActivityPanel,
	type LiveRoomTranscript,
} from "./LiveRoomActivityPanel";

const ACTIVITY: LiveRoomActivity = {
	roster: [
		{ identity: "me", name: "Ада", micOn: true, isLocal: true },
		{ identity: "u2", name: "Борис", micOn: false, isLocal: false },
	],
	speaking: ["me"],
	log: [
		{ id: 1, kind: "join", identity: "me", name: "Ада", at: 1_700_000_000_000 },
	],
};

describe("LiveRoomActivityPanel — transcript section (Streaming-STT Phase-1)", () => {
	it("renders the transcript log with speaker + text when transcript is provided", () => {
		const transcript: LiveRoomTranscript = {
			segments: [
				{
					id: "s1",
					speakerIdentity: "me",
					speakerName: "Ада",
					text: "привет команда",
					capturedAt: 1_700_000_000_000,
				},
				{
					id: "s2",
					speakerIdentity: "u2",
					speakerName: "Борис",
					text: "погнали",
					capturedAt: 1_700_000_005_000,
				},
			],
		};

		const html = renderToStaticMarkup(
			<LiveRoomActivityPanel activity={ACTIVITY} transcript={transcript} />,
		);

		// Section header + both segments (speaker + words) are present.
		expect(html).toContain("Транскрипт");
		expect(html).toContain("привет команда");
		expect(html).toContain("погнали");
		// Presence is NOT regressed — roster + journal still render.
		expect(html).toContain("Активность комнаты");
		expect(html).toContain("Журнал");
	});

	it("shows an empty-transcript hint when the segment log is empty", () => {
		const html = renderToStaticMarkup(
			<LiveRoomActivityPanel
				activity={ACTIVITY}
				transcript={{ segments: [] }}
			/>,
		);
		expect(html).toContain("Транскрипт");
		expect(html).toContain("Пока ничего не сказано");
	});

	it("stays presence-only (no transcript section) when transcript is omitted", () => {
		// The web stub passes no transcript — the panel must not render the STT
		// section at all, preserving the shipped presence-only surface.
		const html = renderToStaticMarkup(
			<LiveRoomActivityPanel activity={ACTIVITY} />,
		);
		expect(html).toContain("Активность комнаты");
		expect(html).not.toContain("Транскрипт");
		expect(html).not.toContain("Пока ничего не сказано");
	});
});
