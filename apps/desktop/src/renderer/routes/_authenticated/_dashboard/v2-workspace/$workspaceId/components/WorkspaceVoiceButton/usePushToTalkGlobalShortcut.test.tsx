import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { VoiceConnectionState } from "@rox/rtc";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Proves the core contract of the renderer half of desktop push-to-talk: a
 * forwarded global-shortcut press toggles the mic ONLY while the voice room is
 * connected (a press with no live room is a no-op).
 *
 * `presses.useSubscription` is registered in the hook BODY (not an effect), so
 * its `onData` is captured during a static render; the test then fires a
 * synthetic press. The connection guard the handler reads (`connectedRef`) is
 * likewise assigned in the render body, so this exercises the real decision
 * path without needing an effect-flushing renderer. No Electron IPC runs.
 */

let capturedOnData: ((data: { at: number }) => void) | null = null;
const setRoomConnectedCalls: boolean[] = [];

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		pushToTalk: {
			presses: {
				useSubscription: (
					_input: undefined,
					opts: { onData: (data: { at: number }) => void },
				) => {
					capturedOnData = opts.onData;
				},
			},
		},
	},
}));

mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		pushToTalk: {
			setRoomConnected: {
				mutate: async ({ connected }: { connected: boolean }) => {
					setRoomConnectedCalls.push(connected);
				},
			},
		},
	},
}));

mock.module("renderer/lib/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

const { usePushToTalkGlobalShortcut } = await import(
	"./usePushToTalkGlobalShortcut"
);

function Harness({
	state,
	toggleMute,
}: {
	state: VoiceConnectionState;
	toggleMute: () => Promise<void>;
}) {
	usePushToTalkGlobalShortcut({ state, toggleMute });
	return null;
}

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	capturedOnData = null;
	setRoomConnectedCalls.length = 0;
});

describe("usePushToTalkGlobalShortcut", () => {
	test("subscribes to global-shortcut presses on mount", () => {
		renderToStaticMarkup(
			<Harness state="connected" toggleMute={async () => {}} />,
		);
		expect(capturedOnData).not.toBeNull();
	});

	test("a global press toggles the mic while connected", async () => {
		let toggleCount = 0;
		renderToStaticMarkup(
			<Harness
				state="connected"
				toggleMute={async () => {
					toggleCount++;
				}}
			/>,
		);

		expect(capturedOnData).not.toBeNull();
		capturedOnData?.({ at: 1 });
		// allow the awaited toggle microtask to settle
		await Promise.resolve();
		expect(toggleCount).toBe(1);
	});

	test("a global press is a NO-OP when not connected", async () => {
		let toggleCount = 0;
		renderToStaticMarkup(
			<Harness
				state="disconnected"
				toggleMute={async () => {
					toggleCount++;
				}}
			/>,
		);

		expect(capturedOnData).not.toBeNull();
		capturedOnData?.({ at: 1 });
		await Promise.resolve();
		expect(toggleCount).toBe(0);
	});
});
