import { db } from "@rox/db/client";
import { chatSessions, v2Workspaces } from "@rox/db/schema";
import {
	buildCliAgentRunFinishedEvent,
	buildUserSentMessageEvent,
	type PipelineEvent,
	publishPipelineEvent,
} from "@rox/workflow-core";
import { and, eq } from "drizzle-orm";

/**
 * Main-API (Neon) ingest for host-originating pipeline events (design §4.3).
 *
 * The desktop host runs on local SQLite and cannot reach the Neon-backed
 * dispatcher (`dispatchPipelineEvent`) or its `pipeline_triggers` registry. It
 * relays the two REAL host-originating events — `user_sent_message` (chat send)
 * and CLI `agent_run_finished` (terminal lifecycle) — to the main API via its
 * authenticated tRPC client (`pipeline.ingestEvent`). This module is the relay's
 * resolve-and-publish core:
 *
 *   1. resolve the org/project SCOPE server-side (the org from the caller's
 *      verified membership — never trusted from the host; the project from the
 *      referenced chat session, or supplied directly for terminal runs),
 *   2. build the typed `PipelineEvent` via the pure builders in
 *      `@rox/workflow-core`, and
 *   3. hand it to the pure `publishPipelineEvent` half — whose registered sink is
 *      the DB-backed `dispatchPipelineEvent` (installed by `register-event-sink`).
 *
 * Reusing `publishPipelineEvent` means the relay path and the in-process path
 * converge on the same fan-out, so the dispatcher's per-trigger error handling
 * and the publish-half's fire-and-forget contract apply uniformly.
 */

/** The two host-originating event variants the host relays (mirror
 * `ingestEventSchema`). */
export type IngestEventInput =
	| { kind: "user_sent_message"; chatSessionId: string; message: string }
	| {
			kind: "agent_run_finished";
			agentRunRef: {
				kind: "terminal" | "chat";
				sessionId: string;
				roleSlug?: string;
				nodeId?: string;
			};
			v2ProjectId?: string;
	  };

export interface IngestEventResult {
	/** Whether a matching scope was resolved and an event was published. */
	published: boolean;
}

/** Resolve a chat session's project scope (`v2WorkspaceId → v2Workspaces.projectId`),
 * org-scoped so a caller can only resolve sessions in their own org. Returns null
 * when the session is missing/foreign or not workspace-bound. Injectable for tests. */
export type ResolveChatSessionProjectPort = (
	organizationId: string,
	chatSessionId: string,
) => Promise<{ v2ProjectId: string | null } | null>;

async function resolveChatSessionProject(
	organizationId: string,
	chatSessionId: string,
): Promise<{ v2ProjectId: string | null } | null> {
	const [row] = await db
		.select({ v2WorkspaceId: chatSessions.v2WorkspaceId })
		.from(chatSessions)
		.where(
			and(
				eq(chatSessions.id, chatSessionId),
				eq(chatSessions.organizationId, organizationId),
			),
		)
		.limit(1);
	// Unknown or cross-org session → no scope (the relay reports not-published
	// rather than firing an org-wide event for a session we can't vouch for).
	if (!row) return null;
	if (!row.v2WorkspaceId) return { v2ProjectId: null };

	const [workspace] = await db
		.select({ projectId: v2Workspaces.projectId })
		.from(v2Workspaces)
		.where(
			and(
				eq(v2Workspaces.id, row.v2WorkspaceId),
				eq(v2Workspaces.organizationId, organizationId),
			),
		)
		.limit(1);
	return { v2ProjectId: workspace?.projectId ?? null };
}

export interface IngestPipelineEventArgs {
	organizationId: string;
	input: IngestEventInput;
	/** Injectable ports (default to the real DB lookup + the pure publisher) so the
	 * resolve→build→publish composition is unit-testable without a DB. */
	ports?: {
		resolveChatSessionProject?: ResolveChatSessionProjectPort;
		publish?: (event: PipelineEvent) => void;
	};
}

/**
 * Resolve scope, build the event, and publish it. Returns `{ published: false }`
 * when scope can't be resolved (e.g. an unknown/foreign chat session) so the
 * relay endpoint can report a no-op without firing a mis-scoped event.
 */
export async function ingestPipelineEvent(
	args: IngestPipelineEventArgs,
): Promise<IngestEventResult> {
	const resolveProject =
		args.ports?.resolveChatSessionProject ?? resolveChatSessionProject;
	const publish = args.ports?.publish ?? publishPipelineEvent;

	if (args.input.kind === "user_sent_message") {
		const scopeProject = await resolveProject(
			args.organizationId,
			args.input.chatSessionId,
		);
		if (!scopeProject) return { published: false };

		publish(
			buildUserSentMessageEvent({
				scope: {
					organizationId: args.organizationId,
					v2ProjectId: scopeProject.v2ProjectId,
				},
				chatSessionId: args.input.chatSessionId,
				message: args.input.message,
			}),
		);
		return { published: true };
	}

	// agent_run_finished (CLI/terminal): the host supplies the project directly
	// (terminals are not persisted in the Neon chat tables to resolve from).
	publish(
		buildCliAgentRunFinishedEvent({
			scope: {
				organizationId: args.organizationId,
				v2ProjectId: args.input.v2ProjectId ?? null,
			},
			agentRunRef: args.input.agentRunRef,
		}),
	);
	return { published: true };
}
