/**
 * Terminal Host Client — pure helpers
 *
 * Side-effect-free transforms extracted from `TerminalHostClient`. None of these
 * read or write instance state, sockets, processes, or the EventEmitter; they
 * only transform their arguments. Keeping them here makes them unit-testable in
 * isolation and shrinks the stateful client class.
 */

import type { CreateOrAttachResponse, ListSessionsResponse } from "./types";

/**
 * Build the dedupe key used to track canceled createOrAttach requests.
 *
 * Mirrors the original inline `${sessionId}:${requestId}` framing.
 */
export function getCreateOrAttachKey({
	sessionId,
	requestId,
}: {
	sessionId: string;
	requestId: string;
}): string {
	return `${sessionId}:${requestId}`;
}

/**
 * Classify an error as a daemon protocol-mismatch error.
 *
 * The daemon signals an incompatible protocol by prefixing its error message
 * with `PROTOCOL_MISMATCH:`; this recognizes that envelope on the client side.
 */
export function isProtocolMismatchError(error: unknown): boolean {
	return (
		error instanceof Error && error.message.startsWith("PROTOCOL_MISMATCH:")
	);
}

/**
 * Normalize a createOrAttach response for version skew.
 *
 * Older daemons may omit `pid`; normalize `undefined` → `null` so callers always
 * see an explicit `number | null`.
 */
export function normalizeCreateOrAttachResponse(
	response: CreateOrAttachResponse,
): CreateOrAttachResponse {
	return { ...response, pid: response.pid ?? null };
}

/**
 * Normalize a listSessions response for version skew.
 *
 * Older daemons may omit per-session `pid`; normalize each `undefined` → `null`.
 */
export function normalizeListSessionsResponse(
	response: ListSessionsResponse,
): ListSessionsResponse {
	return {
		sessions: response.sessions.map((session) => ({
			...session,
			pid: session.pid ?? null,
		})),
	};
}
