import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for the desktop push-to-talk global-shortcut registrar.
 *
 * Electron, the local DB, and the experimental-feature resolver are mocked so
 * the suite exercises OUR gating logic — "register the OS shortcut ONLY while a
 * room is connected AND the experiment is usable, and toggle on press" — with
 * no real Electron, SQLite, or env dependency.
 */

// --- Controllable mock state -------------------------------------------------

interface RegisteredShortcut {
	accelerator: string;
	callback: () => void;
}

let registered: RegisteredShortcut[] = [];
let registerReturns = true;
let featureUsable = true;
let storedAccelerator: string | null = null;

const registerCalls: string[] = [];
const unregisterCalls: string[] = [];

mock.module("electron", () => ({
	globalShortcut: {
		register: (accelerator: string, callback: () => void) => {
			registerCalls.push(accelerator);
			if (!registerReturns) return false;
			registered.push({ accelerator, callback });
			return true;
		},
		unregister: (accelerator: string) => {
			unregisterCalls.push(accelerator);
			registered = registered.filter((r) => r.accelerator !== accelerator);
		},
		isRegistered: (accelerator: string) =>
			registered.some((r) => r.accelerator === accelerator),
	},
	// bun runs all desktop tests in one process and mock.module("electron")
	// leaks across files; include app/dialog so a later file linking against
	// this mock (e.g. modules importing { app, dialog }) doesn't throw
	// "Export named 'app' not found". Mirrors native-permissions.test.ts.
	app: {
		getPath: () => "",
		getName: () => "test-app",
		getVersion: () => "1.0.0",
		getAppPath: () => "",
		isPackaged: false,
	},
	dialog: {
		showMessageBox: () => Promise.resolve({ response: 0 }),
	},
}));

// Settings table row carrying the (possibly null) accelerator.
const capturedInserts: Array<{ pushToTalkAccelerator?: string }> = [];
mock.module("main/lib/local-db", () => ({
	localDb: {
		select: () => ({
			from: () => ({
				get: () => ({ pushToTalkAccelerator: storedAccelerator }),
			}),
		}),
		insert: () => ({
			values: (vals: { pushToTalkAccelerator?: string }) => {
				capturedInserts.push(vals);
				if (typeof vals.pushToTalkAccelerator === "string") {
					storedAccelerator = vals.pushToTalkAccelerator;
				}
				return {
					onConflictDoUpdate: () => ({ run: () => {} }),
				};
			},
		}),
	},
}));

// NOTE: do NOT mock "@rox/local-db" here. The global test-setup.ts preload
// already registers a COMPLETE @rox/local-db mock (settings + every table).
// Overriding it with a partial { settings } object leaks across files (bun's
// shared module registry) and makes a later file importing e.g. { workspaces }
// throw "Export named 'workspaces' not found". push-to-talk only needs the
// `settings` table handle, which the global mock provides; our own
// "main/lib/local-db" mock below drives the actual query assertions.

mock.module("lib/trpc/routers/settings/experimental-feature-state", () => ({
	isExperimentalFeatureUsable: () => featureUsable,
}));

const {
	getPushToTalkAccelerator,
	setPushToTalkAccelerator,
	setPushToTalkRoomConnected,
	syncPushToTalkShortcut,
	onPushToTalkPress,
	disposePushToTalkShortcut,
} = await import("./push-to-talk");

const DEFAULT_ACCELERATOR = "CommandOrControl+Shift+M";

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	registered = [];
	registerReturns = true;
	featureUsable = true;
	storedAccelerator = null;
	registerCalls.length = 0;
	unregisterCalls.length = 0;
	capturedInserts.length = 0;
	// Reset module internal state (disconnect + release any registration).
	disposePushToTalkShortcut();
	registerCalls.length = 0;
	unregisterCalls.length = 0;
});

describe("getPushToTalkAccelerator", () => {
	test("falls back to the default when unset", () => {
		expect(getPushToTalkAccelerator()).toBe(DEFAULT_ACCELERATOR);
	});

	test("returns the stored accelerator when present", () => {
		storedAccelerator = "CommandOrControl+Alt+K";
		expect(getPushToTalkAccelerator()).toBe("CommandOrControl+Alt+K");
	});
});

describe("registration gating", () => {
	test("does NOT register while no room is connected", () => {
		syncPushToTalkShortcut();
		expect(registerCalls).toHaveLength(0);
	});

	test("registers when a room connects AND the feature is usable", () => {
		setPushToTalkRoomConnected(true);
		expect(registerCalls).toEqual([DEFAULT_ACCELERATOR]);
		expect(registered).toHaveLength(1);
	});

	test("does NOT register when connected but the feature is NOT usable", () => {
		featureUsable = false;
		setPushToTalkRoomConnected(true);
		expect(registerCalls).toHaveLength(0);
		expect(registered).toHaveLength(0);
	});

	test("unregisters when the room disconnects", () => {
		setPushToTalkRoomConnected(true);
		expect(registered).toHaveLength(1);
		setPushToTalkRoomConnected(false);
		expect(unregisterCalls).toEqual([DEFAULT_ACCELERATOR]);
		expect(registered).toHaveLength(0);
	});

	test("is idempotent: connecting twice registers once", () => {
		setPushToTalkRoomConnected(true);
		setPushToTalkRoomConnected(true);
		expect(registerCalls).toHaveLength(1);
	});
});

describe("press forwarding", () => {
	test("invokes subscribers only when the OS fires the registered chord", () => {
		let presses = 0;
		const off = onPushToTalkPress(() => {
			presses++;
		});

		setPushToTalkRoomConnected(true);
		expect(registered).toHaveLength(1);

		// Simulate the OS firing the global shortcut.
		registered[0].callback();
		registered[0].callback();
		expect(presses).toBe(2);

		off();
		registered[0].callback();
		expect(presses).toBe(2);
	});
});

describe("setPushToTalkAccelerator", () => {
	test("persists the new accelerator and re-registers if active", () => {
		setPushToTalkRoomConnected(true);
		expect(registered[0]?.accelerator).toBe(DEFAULT_ACCELERATOR);

		setPushToTalkAccelerator("CommandOrControl+Alt+P");

		expect(capturedInserts.at(-1)?.pushToTalkAccelerator).toBe(
			"CommandOrControl+Alt+P",
		);
		// Old binding released, new one registered.
		expect(unregisterCalls).toContain(DEFAULT_ACCELERATOR);
		expect(registered).toHaveLength(1);
		expect(registered[0]?.accelerator).toBe("CommandOrControl+Alt+P");
	});

	test("persists without registering while disconnected", () => {
		setPushToTalkAccelerator("CommandOrControl+Alt+P");
		expect(storedAccelerator).toBe("CommandOrControl+Alt+P");
		expect(registerCalls).toHaveLength(0);
	});
});

describe("disposePushToTalkShortcut", () => {
	test("releases the registration and clears connected state", () => {
		setPushToTalkRoomConnected(true);
		expect(registered).toHaveLength(1);

		disposePushToTalkShortcut();
		expect(registered).toHaveLength(0);

		// After disposal a stale sync must not re-register (room is disconnected).
		syncPushToTalkShortcut();
		expect(registered).toHaveLength(0);
	});
});
