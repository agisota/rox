/**
 * Decide what the cabinet's workspace detail page renders (WS-B T4).
 *
 * Inputs are the resolved facts the page gathers:
 *  - `routingKey`: the `?host=` routing key (present ⇒ a real-host attach was
 *    requested), or null.
 *  - `accessAllowed`: `host.checkAccess` result for that routing key.
 *  - `hasMock`: whether a mock workspace + latest session exist for this id.
 *
 * Decision (no per-page redirect — the `(agents)` layout already gates the flag,
 * WS-B T6):
 *  - real host requested + access allowed ⇒ `live` (bind to the host, D6).
 *  - otherwise fall back to `mock` when a mock session exists.
 *  - otherwise `notFound`.
 *
 * Note: a real-host request WITHOUT access falls through to mock/notFound rather
 * than rendering live — never attach to a host the user cannot reach.
 */
export type WorkspaceView =
	| { kind: "live"; routingKey: string }
	| { kind: "mock" }
	| { kind: "notFound" };

export function resolveWorkspaceView(input: {
	routingKey: string | null;
	accessAllowed: boolean;
	hasMock: boolean;
}): WorkspaceView {
	if (input.routingKey && input.accessAllowed) {
		return { kind: "live", routingKey: input.routingKey };
	}
	if (input.hasMock) {
		return { kind: "mock" };
	}
	return { kind: "notFound" };
}
