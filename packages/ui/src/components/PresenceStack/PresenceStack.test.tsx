import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { setMotionPreferenceSource } from "../../motion";
import { PresenceStack, type PresenceUser } from "./PresenceStack";

function makeUsers(n: number): PresenceUser[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `u${i}`,
		name: `User ${i}`,
		avatarUrl: i % 2 === 0 ? `https://example.test/${i}.png` : null,
	}));
}

function setPreference(value: "full" | "essential" | "off") {
	setMotionPreferenceSource({
		getSnapshot: () => value,
		subscribe: () => () => {},
	});
}

afterEach(() => {
	// Reset to the kit default so other suites are unaffected.
	setMotionPreferenceSource({
		getSnapshot: () => "full",
		subscribe: () => () => {},
	});
});

describe("PresenceStack", () => {
	it("renders one avatar slot per user up to max", () => {
		const html = renderToStaticMarkup(<PresenceStack users={makeUsers(3)} />);
		const count = html.split('data-slot="presence-avatar"').length - 1;
		expect(count).toBe(3);
	});

	it("collapses overflow beyond max into a +N chip", () => {
		const html = renderToStaticMarkup(
			<PresenceStack users={makeUsers(7)} max={5} />,
		);
		const avatars = html.split('data-slot="presence-avatar"').length - 1;
		expect(avatars).toBe(5);
		expect(html).toContain('data-slot="presence-overflow"');
		expect(html).toContain("+2");
	});

	it("renders the static live dot when motion is off", () => {
		setPreference("off");
		const html = renderToStaticMarkup(<PresenceStack users={makeUsers(2)} />);
		expect(html).toContain('data-live-static="true"');
	});

	it("renders a live indicator only when users are present", () => {
		const empty = renderToStaticMarkup(<PresenceStack users={[]} />);
		expect(empty).not.toContain('data-slot="presence-live"');
		const filled = renderToStaticMarkup(<PresenceStack users={makeUsers(1)} />);
		expect(filled).toContain('data-slot="presence-live"');
	});

	it("can hide the live indicator", () => {
		const html = renderToStaticMarkup(
			<PresenceStack users={makeUsers(2)} hideLiveIndicator />,
		);
		expect(html).not.toContain('data-slot="presence-live"');
	});
});
