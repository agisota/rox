/**
 * Live Room Activity — derives a presence/speaking model from a LiveKit `Room`
 * WITHOUT any STT. This is the "live.transcript" SHELL: it answers "who is in
 * the room, who has their mic on, and who is speaking right now", plus a capped
 * timeline of join/leave/speak events.
 *
 * The hard logic lives in PURE functions (`snapshotRoom`, `reduceRoomActivity`)
 * so it is unit-testable with synthetic snapshots and with a fake `Room` through
 * the `createRoom` injection seam in `useVoiceRoom` — no real WebSocket, no STT.
 *
 * Kept isomorphic (types + reducer only, no React, no DOM) so both the desktop
 * `useWorkspaceVoiceRoom` hook and the web call surface can derive an identical
 * `RoomActivity` and feed it to the shared `@rox/ui` panel.
 */

import type { Participant, Room } from "livekit-client";

/** Max number of timeline entries retained in the in-memory ring buffer. */
export const ROOM_ACTIVITY_LOG_LIMIT = 100;

/**
 * Minimum time (ms) a participant must stay (non-)speaking before the opposite
 * speak event is recorded. Debounces `ActiveSpeakersChanged` flicker so a brief
 * blip does not spam the timeline with speak-start/speak-end churn.
 */
export const DEFAULT_SPEAK_DEBOUNCE_MS = 600;

/** A single participant as seen in the live roster. */
export interface RoomActivityParticipant {
	/** Stable LiveKit participant identity (unique within the room). */
	identity: string;
	/** Human-friendly display name; falls back to identity when unset. */
	name: string;
	/** Whether the participant's microphone is currently published + unmuted. */
	micOn: boolean;
	/** Whether this is the local participant (the current user). */
	isLocal: boolean;
}

/** Discrete activity-timeline event kinds. */
export type RoomActivityEventKind =
	| "join"
	| "leave"
	| "speak-start"
	| "speak-end";

/** A single typed entry in the activity timeline ring buffer. */
export interface RoomActivityEvent {
	/** Monotonic id so React keys stay stable as the buffer scrolls. */
	id: number;
	kind: RoomActivityEventKind;
	identity: string;
	name: string;
	/** `Date.now()`-style epoch ms when the event was recorded. */
	at: number;
}

/** The derived, render-ready activity model surfaced to the UI. */
export interface RoomActivity {
	/** Live roster sorted local-first, then by name. */
	roster: RoomActivityParticipant[];
	/** Identities currently speaking (post-debounce). */
	speaking: string[];
	/** Capped timeline, oldest → newest. */
	log: RoomActivityEvent[];
}

/** Internal reducer state (carries debounce + id bookkeeping across ticks). */
export interface RoomActivityState {
	roster: RoomActivityParticipant[];
	/** Identities currently considered "speaking" after debounce. */
	speaking: string[];
	log: RoomActivityEvent[];
	/** Next event id to assign. */
	nextId: number;
	/**
	 * Per-identity pending speak transition: the raw speaking value last seen and
	 * the time it was first observed, used to apply the min-duration debounce.
	 */
	pending: Record<string, { speaking: boolean; since: number }>;
	/** Last committed (debounced) speaking value per identity. */
	committed: Record<string, boolean>;
}

/** A minimal, plain snapshot of one participant (decoupled from livekit class). */
export interface ParticipantSnapshot {
	identity: string;
	name: string;
	micOn: boolean;
	isLocal: boolean;
	speaking: boolean;
}

/** A plain snapshot of the whole room at one instant. */
export interface RoomSnapshot {
	participants: ParticipantSnapshot[];
}

/** Empty starting state for the reducer. */
export function createRoomActivityState(): RoomActivityState {
	return {
		roster: [],
		speaking: [],
		log: [],
		nextId: 1,
		pending: {},
		committed: {},
	};
}

/** Empty render model (used before connect / after disconnect). */
export const EMPTY_ROOM_ACTIVITY: RoomActivity = {
	roster: [],
	speaking: [],
	log: [],
};

function participantName(p: Participant): string {
	const name = p.name?.trim();
	return name && name.length > 0 ? name : p.identity;
}

/**
 * Capture a plain `RoomSnapshot` from a live (or fake) LiveKit `Room`. Reads
 * only stable public getters (`identity`, `name`, `isMicrophoneEnabled`,
 * `isSpeaking`) so a hand-rolled fake in tests can satisfy it without a socket.
 */
export function snapshotRoom(room: Room): RoomSnapshot {
	const participants: ParticipantSnapshot[] = [];

	const local = room.localParticipant;
	if (local) {
		participants.push({
			identity: local.identity,
			name: participantName(local),
			micOn: local.isMicrophoneEnabled,
			isLocal: true,
			speaking: local.isSpeaking,
		});
	}

	for (const remote of room.remoteParticipants.values()) {
		participants.push({
			identity: remote.identity,
			name: participantName(remote),
			micOn: remote.isMicrophoneEnabled,
			isLocal: false,
			speaking: remote.isSpeaking,
		});
	}

	return { participants };
}

function sortRoster(
	roster: RoomActivityParticipant[],
): RoomActivityParticipant[] {
	return [...roster].sort((a, b) => {
		if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
}

function pushEvent(
	state: RoomActivityState,
	kind: RoomActivityEventKind,
	p: { identity: string; name: string },
	at: number,
): void {
	state.log.push({
		id: state.nextId,
		kind,
		identity: p.identity,
		name: p.name,
		at,
	});
	state.nextId += 1;
	if (state.log.length > ROOM_ACTIVITY_LOG_LIMIT) {
		// Drop oldest to keep the ring buffer capped.
		state.log.splice(0, state.log.length - ROOM_ACTIVITY_LOG_LIMIT);
	}
}

/**
 * Fold a `RoomSnapshot` into the activity state, emitting join/leave/speak
 * events (speak transitions are debounced by `debounceMs`). Returns a NEW
 * state object (and new `RoomActivity` arrays) so React re-renders cleanly.
 *
 * Pure given (`state`, `snapshot`, `now`): no clocks, no I/O. The hook supplies
 * `now` (real `Date.now`) and tests supply deterministic timestamps.
 */
export function reduceRoomActivity(
	state: RoomActivityState,
	snapshot: RoomSnapshot,
	now: number,
	debounceMs: number = DEFAULT_SPEAK_DEBOUNCE_MS,
): RoomActivityState {
	const next: RoomActivityState = {
		roster: state.roster,
		speaking: state.speaking,
		log: [...state.log],
		nextId: state.nextId,
		pending: { ...state.pending },
		committed: { ...state.committed },
	};

	const prevByIdentity = new Map(state.roster.map((p) => [p.identity, p]));
	const seen = new Set<string>();

	for (const snap of snapshot.participants) {
		seen.add(snap.identity);
		if (!prevByIdentity.has(snap.identity)) {
			pushEvent(next, "join", snap, now);
			// A fresh participant's committed speaking baseline is "not speaking".
			next.committed[snap.identity] = false;
		}

		// Debounced speak transition.
		const committed = next.committed[snap.identity] ?? false;
		const pending = next.pending[snap.identity];
		if (snap.speaking !== committed) {
			// Value differs from what we last committed → it is a candidate change.
			if (!pending || pending.speaking !== snap.speaking) {
				next.pending[snap.identity] = { speaking: snap.speaking, since: now };
			} else if (now - pending.since >= debounceMs) {
				// Held long enough → commit it and emit the matching event.
				next.committed[snap.identity] = snap.speaking;
				delete next.pending[snap.identity];
				pushEvent(next, snap.speaking ? "speak-start" : "speak-end", snap, now);
			}
		} else if (pending) {
			// Reverted before the debounce window elapsed → cancel the pending change.
			delete next.pending[snap.identity];
		}
	}

	// Departed participants → leave event + cleanup.
	for (const prev of state.roster) {
		if (!seen.has(prev.identity)) {
			pushEvent(next, "leave", prev, now);
			delete next.pending[prev.identity];
			delete next.committed[prev.identity];
		}
	}

	next.roster = sortRoster(
		snapshot.participants.map((p) => ({
			identity: p.identity,
			name: p.name,
			micOn: p.micOn,
			isLocal: p.isLocal,
		})),
	);

	next.speaking = snapshot.participants
		.filter((p) => next.committed[p.identity])
		.map((p) => p.identity)
		.sort();

	return next;
}

/** Project the internal reducer state down to the render-ready model. */
export function toRoomActivity(state: RoomActivityState): RoomActivity {
	return { roster: state.roster, speaking: state.speaking, log: state.log };
}
