import { describe, expect, test } from "bun:test";
import type { Participant, Room } from "livekit-client";

import {
	createRoomActivityState,
	DEFAULT_SPEAK_DEBOUNCE_MS,
	EMPTY_ROOM_ACTIVITY,
	ROOM_ACTIVITY_LOG_LIMIT,
	type RoomSnapshot,
	reduceRoomActivity,
	snapshotRoom,
	toRoomActivity,
} from "./activity";

/**
 * Minimal fake participant exposing only the getters `snapshotRoom` reads. Typed
 * as `Participant` at the boundary so it exercises the real Room-reading seam
 * (no real WebSocket, no STT).
 */
function fakeParticipant(p: {
	identity: string;
	name?: string;
	micOn: boolean;
	speaking: boolean;
}): Participant {
	return {
		identity: p.identity,
		name: p.name,
		isMicrophoneEnabled: p.micOn,
		isSpeaking: p.speaking,
		audioLevel: p.speaking ? 0.5 : 0,
	} as unknown as Participant;
}

/**
 * Fake `Room` satisfying the exact surface `snapshotRoom` consumes
 * (`localParticipant`, `remoteParticipants`). This is the same `createRoom`
 * injection seam `useVoiceRoom` accepts, so the activity pipeline is driven by a
 * fake room — never a live connection.
 */
function fakeRoom(args: {
	local: Parameters<typeof fakeParticipant>[0];
	remotes: Parameters<typeof fakeParticipant>[0][];
}): Room {
	const remoteParticipants = new Map<string, Participant>();
	for (const r of args.remotes) {
		remoteParticipants.set(r.identity, fakeParticipant(r));
	}
	return {
		localParticipant: fakeParticipant(args.local),
		remoteParticipants,
		numParticipants: args.remotes.length,
	} as unknown as Room;
}

/** Helper: fold a snapshot and project to the render model in one step. */
function step(
	state: ReturnType<typeof createRoomActivityState>,
	snapshot: RoomSnapshot,
	now: number,
) {
	const next = reduceRoomActivity(state, snapshot, now);
	return { state: next, activity: toRoomActivity(next) };
}

describe("snapshotRoom", () => {
	test("reads local + remotes with mic + speaking flags", () => {
		const room = fakeRoom({
			local: { identity: "me", name: "Ада", micOn: true, speaking: false },
			remotes: [
				{ identity: "u2", name: "Борис", micOn: false, speaking: true },
				{ identity: "u3", micOn: true, speaking: false },
			],
		});

		const snap = snapshotRoom(room);
		expect(snap.participants).toHaveLength(3);

		const me = snap.participants.find((p) => p.identity === "me");
		expect(me).toEqual({
			identity: "me",
			name: "Ада",
			micOn: true,
			isLocal: true,
			speaking: false,
		});

		// Missing name falls back to identity.
		const u3 = snap.participants.find((p) => p.identity === "u3");
		expect(u3?.name).toBe("u3");
		expect(u3?.isLocal).toBe(false);
	});
});

describe("reduceRoomActivity — roster + join/leave", () => {
	test("emits join events and builds a local-first, name-sorted roster", () => {
		const room = fakeRoom({
			local: { identity: "me", name: "Яков", micOn: true, speaking: false },
			remotes: [
				{ identity: "u2", name: "Борис", micOn: true, speaking: false },
				{ identity: "u3", name: "Анна", micOn: false, speaking: false },
			],
		});

		const { activity } = step(
			createRoomActivityState(),
			snapshotRoom(room),
			1_000,
		);

		// Local first, then remotes alphabetically by name (Анна < Борис).
		expect(activity.roster.map((p) => p.identity)).toEqual(["me", "u3", "u2"]);
		expect(activity.roster[0]?.isLocal).toBe(true);
		expect(activity.roster.find((p) => p.identity === "u3")?.micOn).toBe(false);

		// Three join events recorded.
		const joins = activity.log.filter((e) => e.kind === "join");
		expect(joins).toHaveLength(3);
		expect(joins.map((e) => e.identity).sort()).toEqual(["me", "u2", "u3"]);
	});

	test("emits a leave event when a participant disconnects", () => {
		const before = fakeRoom({
			local: { identity: "me", name: "Я", micOn: true, speaking: false },
			remotes: [
				{ identity: "u2", name: "Гость", micOn: true, speaking: false },
			],
		});
		const r1 = reduceRoomActivity(
			createRoomActivityState(),
			snapshotRoom(before),
			1_000,
		);

		// u2 disconnects (synthetic ParticipantDisconnected → re-snapshot).
		const after = fakeRoom({
			local: { identity: "me", name: "Я", micOn: true, speaking: false },
			remotes: [],
		});
		const r2 = reduceRoomActivity(r1, snapshotRoom(after), 2_000);
		const activity = toRoomActivity(r2);

		expect(activity.roster.map((p) => p.identity)).toEqual(["me"]);
		const leave = activity.log.find((e) => e.kind === "leave");
		expect(leave?.identity).toBe("u2");
		expect(leave?.name).toBe("Гость");
		expect(leave?.at).toBe(2_000);
	});
});

describe("reduceRoomActivity — speaking + debounce", () => {
	test("commits speak-start only after the debounce window elapses", () => {
		const base = {
			local: {
				identity: "me",
				name: "Я",
				micOn: true,
				speaking: false,
			} as const,
			remotes: [] as Parameters<typeof fakeParticipant>[0][],
		};

		let s = createRoomActivityState();
		// t=0: joined, not speaking.
		s = reduceRoomActivity(s, snapshotRoom(fakeRoom(base)), 0);
		expect(toRoomActivity(s).speaking).toEqual([]);

		// t=0: ActiveSpeakersChanged → me starts speaking (candidate, not committed).
		const speaking = {
			...base,
			local: { ...base.local, speaking: true },
		};
		s = reduceRoomActivity(s, snapshotRoom(fakeRoom(speaking)), 0);
		expect(toRoomActivity(s).speaking).toEqual([]); // still debouncing

		// t < debounce: still pending, no speak-start yet.
		s = reduceRoomActivity(
			s,
			snapshotRoom(fakeRoom(speaking)),
			DEFAULT_SPEAK_DEBOUNCE_MS - 1,
		);
		expect(toRoomActivity(s).speaking).toEqual([]);

		// t >= debounce: commit speak-start.
		s = reduceRoomActivity(
			s,
			snapshotRoom(fakeRoom(speaking)),
			DEFAULT_SPEAK_DEBOUNCE_MS,
		);
		const activity = toRoomActivity(s);
		expect(activity.speaking).toEqual(["me"]);
		expect(activity.log.some((e) => e.kind === "speak-start")).toBe(true);
	});

	test("a brief blip shorter than the debounce never records a speak event", () => {
		const base = {
			local: {
				identity: "me",
				name: "Я",
				micOn: true,
				speaking: false,
			} as const,
			remotes: [] as Parameters<typeof fakeParticipant>[0][],
		};
		let s = reduceRoomActivity(
			createRoomActivityState(),
			snapshotRoom(fakeRoom(base)),
			0,
		);

		// Speaking flips on then off within the debounce window.
		const on = { ...base, local: { ...base.local, speaking: true } };
		s = reduceRoomActivity(s, snapshotRoom(fakeRoom(on)), 0);
		s = reduceRoomActivity(s, snapshotRoom(fakeRoom(base)), 100); // reverted < 600ms

		const activity = toRoomActivity(s);
		expect(activity.speaking).toEqual([]);
		expect(activity.log.some((e) => e.kind.startsWith("speak"))).toBe(false);
	});

	test("commits speak-end after the participant stays quiet past the window", () => {
		const base = {
			local: {
				identity: "me",
				name: "Я",
				micOn: true,
				speaking: true,
			} as const,
			remotes: [] as Parameters<typeof fakeParticipant>[0][],
		};
		let s = reduceRoomActivity(
			createRoomActivityState(),
			snapshotRoom(fakeRoom(base)),
			0,
		);
		// Commit speak-start first.
		s = reduceRoomActivity(
			s,
			snapshotRoom(fakeRoom(base)),
			DEFAULT_SPEAK_DEBOUNCE_MS,
		);
		expect(toRoomActivity(s).speaking).toEqual(["me"]);

		// Stop speaking, hold past the window → speak-end commits.
		const quiet = { ...base, local: { ...base.local, speaking: false } };
		const stopAt = DEFAULT_SPEAK_DEBOUNCE_MS;
		s = reduceRoomActivity(s, snapshotRoom(fakeRoom(quiet)), stopAt);
		s = reduceRoomActivity(
			s,
			snapshotRoom(fakeRoom(quiet)),
			stopAt + DEFAULT_SPEAK_DEBOUNCE_MS,
		);

		const activity = toRoomActivity(s);
		expect(activity.speaking).toEqual([]);
		expect(activity.log.some((e) => e.kind === "speak-end")).toBe(true);
	});
});

describe("reduceRoomActivity — ring buffer", () => {
	test(`caps the log at ${ROOM_ACTIVITY_LOG_LIMIT} entries, dropping oldest`, () => {
		let s = createRoomActivityState();
		// Churn many distinct participants to generate > limit join events.
		const churn = ROOM_ACTIVITY_LOG_LIMIT + 25;
		for (let i = 0; i < churn; i++) {
			const room = fakeRoom({
				local: { identity: "me", name: "Я", micOn: true, speaking: false },
				remotes: [
					{ identity: `u${i}`, name: `U${i}`, micOn: true, speaking: false },
				],
			});
			s = reduceRoomActivity(s, snapshotRoom(room), i);
		}

		const activity = toRoomActivity(s);
		expect(activity.log.length).toBe(ROOM_ACTIVITY_LOG_LIMIT);
		// Oldest dropped: the very first "me" join (id 1) must be gone, newest kept.
		expect(activity.log.some((e) => e.id === 1)).toBe(false);
		// Ids are strictly increasing (monotonic, stable React keys).
		let prevId = Number.NEGATIVE_INFINITY;
		let strictlyIncreasing = true;
		for (const event of activity.log) {
			if (event.id <= prevId) strictlyIncreasing = false;
			prevId = event.id;
		}
		expect(strictlyIncreasing).toBe(true);
	});
});

describe("EMPTY_ROOM_ACTIVITY", () => {
	test("is a fully empty model", () => {
		expect(EMPTY_ROOM_ACTIVITY).toEqual({ roster: [], speaking: [], log: [] });
	});
});
