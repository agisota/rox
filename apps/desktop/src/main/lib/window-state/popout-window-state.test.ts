import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	loadPopoutWindowState,
	loadPopoutWindowStates,
	savePopoutWindowState,
} from "./popout-window-state";

// The on-disk path is injectable (last arg), so each test runs against its own
// throwaway temp file and the real ~/.rox state is never touched.
let dir: string;
let path: string;

const stateA = { x: 0, y: 0, width: 800, height: 600, isMaximized: false };
const stateB = { x: 50, y: 60, width: 500, height: 400, isMaximized: false };

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "popout-window-state-"));
	path = join(dir, "popout-windows.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("popout-window-state", () => {
	it("returns empty / null before anything is saved", () => {
		expect(loadPopoutWindowStates(path)).toEqual({});
		expect(loadPopoutWindowState("popout:ws:p1", path)).toBeNull();
	});

	it("persists and reloads a single popout's bounds", () => {
		savePopoutWindowState("popout:ws:p1", stateA, path);
		expect(loadPopoutWindowState("popout:ws:p1", path)).toEqual(stateA);
	});

	it("keeps popouts isolated — saving one never clobbers another", () => {
		savePopoutWindowState("popout:ws:p1", stateA, path);
		savePopoutWindowState("popout:ws:p2", stateB, path);
		expect(loadPopoutWindowState("popout:ws:p1", path)).toEqual(stateA);
		expect(loadPopoutWindowState("popout:ws:p2", path)).toEqual(stateB);
	});

	it("removing one popout leaves the others intact", () => {
		savePopoutWindowState("popout:ws:p1", stateA, path);
		savePopoutWindowState("popout:ws:p2", stateB, path);
		savePopoutWindowState("popout:ws:p1", null, path);
		expect(loadPopoutWindowState("popout:ws:p1", path)).toBeNull();
		expect(loadPopoutWindowState("popout:ws:p2", path)).toEqual(stateB);
	});
});
