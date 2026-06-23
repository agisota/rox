import { describe, expect, it } from "bun:test";
import {
	eventToPushToTalkAccelerator,
	formatPushToTalkAccelerator,
} from "./pushToTalkAccelerator";

/** Build a minimal KeyboardEvent-like object for the converter under test. */
function keyEvent(
	overrides: Partial<
		Pick<
			KeyboardEvent,
			"key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
		>
	>,
): KeyboardEvent {
	return {
		key: "",
		code: "",
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		...overrides,
	} as KeyboardEvent;
}

describe("eventToPushToTalkAccelerator", () => {
	it("maps a letter with the primary modifier to CommandOrControl+<L>", () => {
		expect(
			eventToPushToTalkAccelerator(
				keyEvent({ key: "m", code: "KeyM", metaKey: true }),
			),
		).toBe("CommandOrControl+M");
	});

	it("includes Shift and Alt and orders modifiers deterministically", () => {
		expect(
			eventToPushToTalkAccelerator(
				keyEvent({
					key: "M",
					code: "KeyM",
					ctrlKey: true,
					altKey: true,
					shiftKey: true,
				}),
			),
		).toBe("CommandOrControl+Alt+Shift+M");
	});

	it("uses the physical code so the binding is layout-stable", () => {
		// German QWERTZ: pressing the key labeled Z is physical KeyY.
		expect(
			eventToPushToTalkAccelerator(
				keyEvent({ key: "z", code: "KeyY", metaKey: true }),
			),
		).toBe("CommandOrControl+Y");
	});

	it("rejects a key with no modifier (would hijack typing globally)", () => {
		expect(
			eventToPushToTalkAccelerator(keyEvent({ key: "m", code: "KeyM" })),
		).toBeNull();
	});

	it("rejects a bare modifier press", () => {
		expect(
			eventToPushToTalkAccelerator(
				keyEvent({ key: "Shift", code: "ShiftLeft", shiftKey: true }),
			),
		).toBeNull();
	});

	it("normalizes named keys to Electron tokens", () => {
		expect(
			eventToPushToTalkAccelerator(
				keyEvent({ key: " ", code: "Space", metaKey: true }),
			),
		).toBe("CommandOrControl+Space");
		expect(
			eventToPushToTalkAccelerator(
				keyEvent({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true }),
			),
		).toBe("CommandOrControl+Up");
	});

	it("supports digits and function keys", () => {
		expect(
			eventToPushToTalkAccelerator(
				keyEvent({ key: "1", code: "Digit1", metaKey: true }),
			),
		).toBe("CommandOrControl+1");
		expect(
			eventToPushToTalkAccelerator(
				keyEvent({ key: "F5", code: "F5", altKey: true }),
			),
		).toBe("Alt+F5");
	});
});

describe("formatPushToTalkAccelerator", () => {
	it("renders human-readable modifier glyphs", () => {
		expect(formatPushToTalkAccelerator("CommandOrControl+Shift+M")).toEqual([
			"⌘/Ctrl",
			"⇧",
			"M",
		]);
	});

	it("passes through unknown tokens unchanged", () => {
		expect(formatPushToTalkAccelerator("CommandOrControl+K")).toEqual([
			"⌘/Ctrl",
			"K",
		]);
	});
});
