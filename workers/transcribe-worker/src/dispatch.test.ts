import { describe, expect, test } from "bun:test";

import { isVoiceRoom, livekitHttpHost, reconcileRooms } from "./dispatch";

describe("isVoiceRoom", () => {
	test("matches org:<org>:voice:<channel> rooms", () => {
		expect(isVoiceRoom("org:acme:voice:general")).toBe(true);
		expect(isVoiceRoom("org:acme:voice:c_123")).toBe(true);
		// org id may itself be a uuid-ish slug with no colons.
		expect(isVoiceRoom("org:01HXYZ:voice:standup")).toBe(true);
	});

	test("rejects non-voice / malformed room names", () => {
		expect(isVoiceRoom("org:acme:text:general")).toBe(false);
		expect(isVoiceRoom("agent:acme:run:42")).toBe(false);
		expect(isVoiceRoom("voice:general")).toBe(false);
		expect(isVoiceRoom("org::voice:x")).toBe(false); // empty org segment
		expect(isVoiceRoom("")).toBe(false);
		expect(isVoiceRoom("random-room")).toBe(false);
	});
});

describe("reconcileRooms", () => {
	test("a new active voice room -> toSpawn", () => {
		const plan = reconcileRooms(["org:a:voice:general"], []);
		expect(plan.toSpawn).toEqual(["org:a:voice:general"]);
		expect(plan.toKill).toEqual([]);
	});

	test("a gone room (running but no longer active) -> toKill", () => {
		const plan = reconcileRooms([], ["org:a:voice:general"]);
		expect(plan.toSpawn).toEqual([]);
		expect(plan.toKill).toEqual(["org:a:voice:general"]);
	});

	test("a stable set -> empty plan (no spawn, no kill)", () => {
		const rooms = ["org:a:voice:general", "org:b:voice:standup"];
		const plan = reconcileRooms(rooms, rooms);
		expect(plan.toSpawn).toEqual([]);
		expect(plan.toKill).toEqual([]);
	});

	test("non-voice active rooms are ignored (never spawned)", () => {
		const plan = reconcileRooms(
			["org:a:voice:general", "org:a:text:general", "agent:a:run:1", "lobby"],
			[],
		);
		// ONLY the voice room is scheduled to spawn.
		expect(plan.toSpawn).toEqual(["org:a:voice:general"]);
		expect(plan.toKill).toEqual([]);
	});

	test("a non-voice running name is never killed by the diff (defensive)", () => {
		// The supervisor only ever runs voice-room children, but assert that a stray
		// non-voice 'running' entry is filtered out and not emitted as toKill.
		const plan = reconcileRooms(
			["org:a:voice:general"],
			["org:a:voice:general", "some-non-voice-room"],
		);
		expect(plan.toSpawn).toEqual([]);
		expect(plan.toKill).toEqual([]);
	});

	test("multiple rooms: simultaneous spawn + kill + stable", () => {
		const active = [
			"org:a:voice:general", // stable
			"org:b:voice:standup", // stable
			"org:c:voice:new", // newly active -> spawn
		];
		const runningRooms = [
			"org:a:voice:general", // stable
			"org:b:voice:standup", // stable
			"org:d:voice:old", // gone -> kill
		];
		const plan = reconcileRooms(active, runningRooms);
		expect(plan.toSpawn).toEqual(["org:c:voice:new"]);
		expect(plan.toKill).toEqual(["org:d:voice:old"]);
	});

	test("multiple new rooms spawn together, deterministically sorted", () => {
		const plan = reconcileRooms(
			["org:z:voice:z1", "org:a:voice:a1", "org:m:voice:m1"],
			[],
		);
		expect(plan.toSpawn).toEqual([
			"org:a:voice:a1",
			"org:m:voice:m1",
			"org:z:voice:z1",
		]);
		expect(plan.toKill).toEqual([]);
	});

	test("duplicate active room names are de-duplicated into a single spawn", () => {
		const plan = reconcileRooms(
			["org:a:voice:general", "org:a:voice:general"],
			[],
		);
		expect(plan.toSpawn).toEqual(["org:a:voice:general"]);
		expect(plan.toKill).toEqual([]);
	});

	test("empty inputs -> empty plan", () => {
		const plan = reconcileRooms([], []);
		expect(plan.toSpawn).toEqual([]);
		expect(plan.toKill).toEqual([]);
	});
});

describe("livekitHttpHost", () => {
	test("converts wss:// to https:// for the RoomServiceClient host", () => {
		expect(livekitHttpHost("wss://sfu.livekit.cloud")).toBe(
			"https://sfu.livekit.cloud",
		);
	});

	test("converts ws:// to http://", () => {
		expect(livekitHttpHost("ws://localhost:7880")).toBe(
			"http://localhost:7880",
		);
	});

	test("passes an already-http(s) host through unchanged", () => {
		expect(livekitHttpHost("https://sfu.example.com")).toBe(
			"https://sfu.example.com",
		);
		expect(livekitHttpHost("http://sfu.example.com")).toBe(
			"http://sfu.example.com",
		);
	});
});
