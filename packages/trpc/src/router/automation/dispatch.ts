import { mintUserJwt } from "@rox/auth/server";
import { dbWs } from "@rox/db/client";
import {
	automationRuns,
	journalEvents,
	type SelectAutomation,
	users,
	v2Hosts,
	v2UsersHosts,
} from "@rox/db/schema";
import { buildHostRoutingKey } from "@rox/shared/host-routing";
import {
	deduplicateBranchName,
	sanitizeBranchNameWithMaxLength,
	slugifyForBranch,
} from "@rox/shared/workspace-launch";
import { and, eq } from "drizzle-orm";
import { RelayDispatchError, relayMutation } from "./relay-client";

type AgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "chat"; sessionId: string; label: string };

export type DispatchOutcome =
	| { status: "dispatched"; runId: string }
	| { status: "skipped_offline"; runId: string | null; error: string }
	| { status: "dispatch_failed"; runId: string | null; error: string }
	| { status: "conflict" };

export interface DispatchOptions {
	automation: SelectAutomation;
	scheduledFor: Date;
	relayUrl: string;
}

/**
 * Run one automation: resolve host, (maybe) create a workspace, start the
 * agent session. Writes an automation_runs row regardless of outcome. Does
 * NOT touch automations.next_run_at — that advancement is the caller's
 * concern (the cron advances on every tick; runNow intentionally leaves
 * the regular cadence alone).
 *
 * Also appends one row to the continuous journal event lane (`journal_events`)
 * for every dispatch outcome, so the journal fills 24/7 from the existing
 * `* * * * *` automations dispatcher with no extra cron. The journal write is
 * strictly best-effort and never alters the dispatch outcome.
 */
export async function dispatchAutomation(
	opts: DispatchOptions,
): Promise<DispatchOutcome> {
	const outcome = await runDispatch(opts);
	await recordJournalEvent({
		automation: opts.automation,
		outcome,
		scheduledFor: opts.scheduledFor,
	});
	return outcome;
}

async function runDispatch(opts: DispatchOptions): Promise<DispatchOutcome> {
	const { automation, scheduledFor, relayUrl } = opts;

	const resolved = await resolveTargetHost(automation);
	if (!resolved) {
		const error = "no host available";
		const inserted = await recordSkipped(automation, scheduledFor, null, error);
		return { status: "skipped_offline", runId: inserted?.id ?? null, error };
	}
	const host = resolved;
	if (!host.isOnline) {
		const error = "target host offline";
		const inserted = await recordSkipped(
			automation,
			scheduledFor,
			host.machineId,
			error,
		);
		return { status: "skipped_offline", runId: inserted?.id ?? null, error };
	}

	const [run] = await dbWs
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			title: automation.name,
			scheduledFor,
			hostId: host.machineId,
			status: "dispatching",
		})
		.onConflictDoNothing({
			target: [automationRuns.automationId, automationRuns.scheduledFor],
		})
		.returning();

	if (!run) return { status: "conflict" };

	let workspaceId: string | null = null;
	try {
		const [owner] = await dbWs
			.select({ email: users.email })
			.from(users)
			.where(eq(users.id, automation.ownerUserId))
			.limit(1);

		const jwt = await mintUserJwt({
			userId: automation.ownerUserId,
			email: owner?.email,
			organizationIds: [automation.organizationId],
			scope: "automation-run",
			runId: run.id,
			ttlSeconds: 300,
		});

		const routingKey = buildHostRoutingKey(
			automation.organizationId,
			host.machineId,
		);

		if (automation.v2WorkspaceId) {
			workspaceId = automation.v2WorkspaceId;
		} else {
			const created = await createWorkspaceOnHost({
				relayUrl,
				hostId: routingKey,
				jwt,
				projectId: automation.v2ProjectId,
				automation,
				runId: run.id,
			});
			workspaceId = created.workspaceId;
		}

		const result = await runAgentOnHost({
			relayUrl,
			hostId: routingKey,
			jwt,
			workspaceId,
			agent: automation.agent,
			prompt: automation.prompt,
		});

		await dbWs
			.update(automationRuns)
			.set({
				status: "dispatched",
				sessionKind: result.kind,
				chatSessionId: result.kind === "chat" ? result.sessionId : null,
				terminalSessionId: result.kind === "terminal" ? result.sessionId : null,
				v2WorkspaceId: workspaceId,
				dispatchedAt: new Date(),
			})
			.where(eq(automationRuns.id, run.id));
	} catch (err) {
		const error = describeError(err, "dispatch");
		await dbWs
			.update(automationRuns)
			.set({
				status: "dispatch_failed",
				v2WorkspaceId: workspaceId,
				error,
			})
			.where(eq(automationRuns.id, run.id));
		return { status: "dispatch_failed", runId: run.id, error };
	}

	return { status: "dispatched", runId: run.id };
}

/**
 * Append one row to the continuous journal event lane for a dispatch outcome.
 * Strictly best-effort: a journal write must never break (or change the result
 * of) an automation run, so all failures are swallowed with a log.
 */
async function recordJournalEvent(args: {
	automation: SelectAutomation;
	outcome: DispatchOutcome;
	scheduledFor: Date;
}): Promise<void> {
	const { automation, outcome, scheduledFor } = args;
	const runId = "runId" in outcome ? outcome.runId : null;
	const error = "error" in outcome ? outcome.error : undefined;
	try {
		await dbWs.insert(journalEvents).values({
			organizationId: automation.organizationId,
			createdBy: automation.ownerUserId,
			automationId: automation.id,
			automationRunId: runId,
			kind: "automation_run",
			title: automation.name,
			summary: summarizeOutcome(outcome),
			payload: {
				automationId: automation.id,
				runId,
				status: outcome.status,
				agent: automation.agent,
				scheduledFor: scheduledFor.toISOString(),
				...(error ? { error } : {}),
			},
		});
	} catch (err) {
		console.error(
			"[automations/dispatch] journal event write failed",
			describeError(err, "journal"),
		);
	}
}

function summarizeOutcome(outcome: DispatchOutcome): string {
	switch (outcome.status) {
		case "dispatched":
			return "Автоматизация запущена";
		case "skipped_offline":
			return `Пропущено: ${outcome.error}`;
		case "dispatch_failed":
			return `Ошибка запуска: ${outcome.error}`;
		case "conflict":
			return "Пропущено: дубликат запуска";
	}
}

async function resolveTargetHost(
	automation: SelectAutomation,
): Promise<typeof v2Hosts.$inferSelect | null> {
	if (automation.targetHostId) {
		const [host] = await dbWs
			.select()
			.from(v2Hosts)
			.where(
				and(
					eq(v2Hosts.organizationId, automation.organizationId),
					eq(v2Hosts.machineId, automation.targetHostId),
				),
			)
			.limit(1);

		return host ?? null;
	}

	const [host] = await dbWs
		.select({
			organizationId: v2Hosts.organizationId,
			machineId: v2Hosts.machineId,
			name: v2Hosts.name,
			isOnline: v2Hosts.isOnline,
			port: v2Hosts.port,
			protocol: v2Hosts.protocol,
			kind: v2Hosts.kind,
			provider: v2Hosts.provider,
			expiresAt: v2Hosts.expiresAt,
			createdByUserId: v2Hosts.createdByUserId,
			createdAt: v2Hosts.createdAt,
			updatedAt: v2Hosts.updatedAt,
		})
		.from(v2Hosts)
		.innerJoin(
			v2UsersHosts,
			and(
				eq(v2UsersHosts.organizationId, v2Hosts.organizationId),
				eq(v2UsersHosts.hostId, v2Hosts.machineId),
			),
		)
		.where(
			and(
				eq(v2UsersHosts.userId, automation.ownerUserId),
				eq(v2Hosts.organizationId, automation.organizationId),
				eq(v2Hosts.isOnline, true),
			),
		)
		.orderBy(v2Hosts.updatedAt)
		.limit(1);

	return host ?? null;
}

async function recordSkipped(
	automation: SelectAutomation,
	scheduledFor: Date,
	hostId: string | null,
	error: string,
): Promise<{ id: string } | undefined> {
	const [row] = await dbWs
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			title: automation.name,
			scheduledFor,
			hostId,
			status: "skipped_offline",
			error,
		})
		.onConflictDoNothing({
			target: [automationRuns.automationId, automationRuns.scheduledFor],
		})
		.returning({ id: automationRuns.id });
	return row;
}

async function createWorkspaceOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	projectId: string;
	automation: SelectAutomation;
	runId: string;
}): Promise<{ workspaceId: string; branchName: string }> {
	// Full-precision timestamp keeps branch names readable AND collision-free
	// for anything coarser than 1 second.
	// e.g. "2026-04-19-17-30-00"
	const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
	const baseSlug = slugifyForBranch(args.automation.name, 30);
	const candidateBranch = sanitizeBranchNameWithMaxLength(
		baseSlug ? `${baseSlug}-${timestamp}` : `automation-${timestamp}`,
		60,
	);
	const branchName = deduplicateBranchName(candidateBranch, []);
	const workspaceName = args.automation.name.slice(0, 100);

	const result = await relayMutation<
		{
			projectId: string;
			name: string;
			branch: string;
		},
		{
			workspace: {
				id: string;
				projectId: string;
				name: string;
				branch: string;
			};
			terminals: Array<{ terminalId: string; label?: string }>;
			agents: Array<unknown>;
			alreadyExists: boolean;
		}
	>(
		{
			relayUrl: args.relayUrl,
			hostId: args.hostId,
			jwt: args.jwt,
			// Workspace creation does git clone + worktree setup — bigger repos
			// can comfortably take >25s. Give it real room.
			timeoutMs: 90_000,
		},
		"workspaces.create",
		{
			projectId: args.projectId,
			name: workspaceName,
			branch: branchName,
		},
	);

	return { workspaceId: result.workspace.id, branchName };
}

async function runAgentOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	workspaceId: string;
	agent: string;
	prompt: string;
}): Promise<AgentRunResult> {
	return relayMutation<
		{
			workspaceId: string;
			agent: string;
			prompt: string;
		},
		AgentRunResult
	>(
		{ relayUrl: args.relayUrl, hostId: args.hostId, jwt: args.jwt },
		"agents.run",
		{
			workspaceId: args.workspaceId,
			agent: args.agent,
			prompt: args.prompt,
		},
	);
}

function describeError(err: unknown, context: string): string {
	if (err instanceof RelayDispatchError) return `${context}: ${err.message}`;
	if (err instanceof Error) return `${context}: ${err.message}`;
	return `${context}: unknown error`;
}
