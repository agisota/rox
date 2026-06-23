/**
 * Tests for the pure helpers extracted from `TerminalHostClient`.
 *
 * These cover deterministic, side-effect-free transforms: the createOrAttach
 * cancel-key builder, protocol-mismatch error classification, and version-skew
 * pid normalization for createOrAttach / listSessions responses.
 */

import { describe, expect, test } from "bun:test";
import {
	getCreateOrAttachKey,
	isProtocolMismatchError,
	normalizeCreateOrAttachResponse,
	normalizeListSessionsResponse,
} from "./client-helpers";
import type {
	CreateOrAttachResponse,
	ListSessionsResponse,
	TerminalSnapshot,
} from "./types";
import { DEFAULT_MODES } from "./types";

const snapshot: TerminalSnapshot = {
	snapshotAnsi: "",
	rehydrateSequences: "",
	cwd: null,
	modes: DEFAULT_MODES,
	cols: 80,
	rows: 24,
	scrollbackLines: 0,
};

describe("getCreateOrAttachKey", () => {
	test("joins sessionId and requestId with a colon", () => {
		expect(getCreateOrAttachKey({ sessionId: "sess", requestId: "req" })).toBe(
			"sess:req",
		);
	});

	test("preserves empty segments", () => {
		expect(getCreateOrAttachKey({ sessionId: "", requestId: "" })).toBe(":");
	});

	test("does not collapse extra colons in the inputs", () => {
		expect(getCreateOrAttachKey({ sessionId: "a:b", requestId: "c:d" })).toBe(
			"a:b:c:d",
		);
	});
});

describe("isProtocolMismatchError", () => {
	test("recognizes the PROTOCOL_MISMATCH envelope", () => {
		expect(
			isProtocolMismatchError(new Error("PROTOCOL_MISMATCH: upgrade required")),
		).toBe(true);
	});

	test("requires the prefix at the start of the message", () => {
		expect(
			isProtocolMismatchError(new Error("wrapped PROTOCOL_MISMATCH: nope")),
		).toBe(false);
	});

	test("rejects the human-readable protocol version mismatch message", () => {
		// The client throws "Protocol version mismatch: ..." which must NOT be
		// classified as the daemon PROTOCOL_MISMATCH envelope.
		expect(
			isProtocolMismatchError(
				new Error("Protocol version mismatch: client=2, daemon=1"),
			),
		).toBe(false);
	});

	test("returns false for non-Error values", () => {
		expect(isProtocolMismatchError("PROTOCOL_MISMATCH: string")).toBe(false);
		expect(isProtocolMismatchError(null)).toBe(false);
		expect(isProtocolMismatchError(undefined)).toBe(false);
		expect(isProtocolMismatchError({ message: "PROTOCOL_MISMATCH:" })).toBe(
			false,
		);
	});
});

describe("normalizeCreateOrAttachResponse", () => {
	test("normalizes an undefined pid to null", () => {
		const response = {
			isNew: true,
			snapshot,
			wasRecovered: false,
			pid: undefined,
		} as unknown as CreateOrAttachResponse;

		expect(normalizeCreateOrAttachResponse(response)).toEqual({
			isNew: true,
			snapshot,
			wasRecovered: false,
			pid: null,
		});
	});

	test("preserves a present numeric pid", () => {
		const response: CreateOrAttachResponse = {
			isNew: false,
			snapshot,
			wasRecovered: true,
			pid: 4242,
		};

		expect(normalizeCreateOrAttachResponse(response)).toEqual(response);
	});

	test("keeps an explicit null pid", () => {
		const response: CreateOrAttachResponse = {
			isNew: true,
			snapshot,
			wasRecovered: false,
			pid: null,
		};

		expect(normalizeCreateOrAttachResponse(response).pid).toBeNull();
	});
});

describe("normalizeListSessionsResponse", () => {
	test("normalizes undefined per-session pids to null", () => {
		const response = {
			sessions: [
				{
					sessionId: "s1",
					workspaceId: "w1",
					paneId: "p1",
					isAlive: true,
					attachedClients: 1,
					pid: undefined,
				},
				{
					sessionId: "s2",
					workspaceId: "w2",
					paneId: "p2",
					isAlive: false,
					attachedClients: 0,
					pid: 99,
				},
			],
		} as unknown as ListSessionsResponse;

		expect(normalizeListSessionsResponse(response)).toEqual({
			sessions: [
				{
					sessionId: "s1",
					workspaceId: "w1",
					paneId: "p1",
					isAlive: true,
					attachedClients: 1,
					pid: null,
				},
				{
					sessionId: "s2",
					workspaceId: "w2",
					paneId: "p2",
					isAlive: false,
					attachedClients: 0,
					pid: 99,
				},
			],
		});
	});

	test("returns an empty sessions array unchanged", () => {
		expect(normalizeListSessionsResponse({ sessions: [] })).toEqual({
			sessions: [],
		});
	});

	test("preserves optional session metadata fields", () => {
		const response: ListSessionsResponse = {
			sessions: [
				{
					sessionId: "s1",
					workspaceId: "w1",
					paneId: "p1",
					isAlive: true,
					attachedClients: 2,
					pid: 7,
					createdAt: "2024-01-01T00:00:00.000Z",
					lastAttachedAt: "2024-01-02T00:00:00.000Z",
					shell: "/bin/zsh",
				},
			],
		};

		expect(normalizeListSessionsResponse(response)).toEqual(response);
	});
});
