import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Memory } from "@mastra/memory";
import {
	getSlashCommands as getSlashCommandsFromCwd,
	resolveSlashCommand as resolveSlashCommandFromCwd,
} from "@rox/chat/server/desktop";
import type { Engine, EngineBundle } from "@rox/chat/server/engine";
import { createEngine } from "@rox/chat/server/engine";
import {
	isRoxHouseModel,
	resolveChatWireModelId,
	resolveRoxFallbackWireModelId,
} from "@rox/shared/chat-models";
import {
	type PermissionMode,
	permissionModeToHarnessState,
} from "@rox/shared/chat-permission-mode";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import { workspaces } from "../../db/schema";
import type { ModelProviderRuntimeResolver } from "../../providers/model-providers";

type RuntimeEngine = Engine;
type RuntimeMcpManager = EngineBundle["mcpManager"];
type RuntimeHookManager = EngineBundle["hookManager"];
type RuntimeDisplayState = ReturnType<RuntimeEngine["getDisplayState"]>;
type RuntimeMessages = Awaited<ReturnType<RuntimeEngine["listMessages"]>>;
type RuntimeSendMessageResult = Awaited<
	ReturnType<RuntimeEngine["sendMessage"]>
>;
type RuntimeApprovalResult = ReturnType<RuntimeEngine["respondToToolApproval"]>;
type RuntimeQuestionResult = ReturnType<RuntimeEngine["respondToQuestion"]>;
type RuntimePlanResult = Awaited<
	ReturnType<RuntimeEngine["respondToPlanApproval"]>
>;
type ChatThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh";

interface ChatSendMessageInput {
	sessionId: string;
	workspaceId: string;
	payload: {
		content: string;
		files?: Array<{
			data: string;
			mediaType: string;
			filename?: string;
		}>;
	};
	metadata?: {
		model?: string;
		thinkingLevel?: ChatThinkingLevel;
		permissionMode?: PermissionMode;
	};
}

interface RestartPayload extends ChatSendMessageInput {
	messageId: string;
}

interface PendingSandboxQuestion {
	questionId: string;
	path: string;
	reason: string;
}

interface ChatPendingQuestionOption {
	label: string;
	description?: string;
}

interface ChatPendingQuestion {
	questionId: string;
	question: string;
	description?: string;
	options: ChatPendingQuestionOption[];
}

export type ChatDisplayState = RuntimeDisplayState & {
	pendingQuestion:
		| RuntimeDisplayState["pendingQuestion"]
		| ChatPendingQuestion
		| null;
	errorMessage: string | null;
};

interface ChatApprovalPayload {
	decision: "approve" | "decline" | "always_allow_category";
}

interface ChatQuestionPayload {
	questionId: string;
	answer: string;
}

interface ChatPlanPayload {
	planId: string;
	response: {
		action: "approved" | "rejected";
		feedback?: string;
	};
}

/**
 * Per-turn state for the Rox house-model failover. When the user sends a turn on
 * the Rox house model (Compound), we record the payload and the fallback wire id
 * so a model-level error event can re-issue the turn once with
 * `deepseek-v4-flash`. Cleared when a turn starts/ends or the user switches away.
 */
interface RoxFallbackState {
	/** The fallback wire id to switch to (`openai/deepseek-v4-flash`). */
	fallbackWireModelId: string;
	/** The original user payload, replayed verbatim on fallback. */
	payload: ChatSendMessageInput["payload"];
	/** Set once the fallback has been attempted so it fires at most once. */
	attempted: boolean;
}

interface RuntimeSession {
	sessionId: string;
	workspaceId: string;
	cwd: string;
	engine: RuntimeEngine;
	mcpManager: RuntimeMcpManager;
	hookManager: RuntimeHookManager;
	lastErrorMessage: string | null;
	pendingSandboxQuestion: PendingSandboxQuestion | null;
	answeredQuestionIds: Set<string>;
	pendingQuestionResponses: Map<string, Promise<RuntimeQuestionResult>>;
	/** Armed only while a Rox house-model turn awaits its first response. */
	roxFallback: RoxFallbackState | null;
}

function respondToQuestionWithOptimisticState(
	runtime: RuntimeSession,
	payload: ChatQuestionPayload,
): Promise<RuntimeQuestionResult> {
	const questionId = payload.questionId;
	const pendingResponse = runtime.pendingQuestionResponses.get(questionId);
	if (pendingResponse) return pendingResponse;

	const wasAlreadyAnswered = runtime.answeredQuestionIds.has(questionId);
	const previousSandboxQuestion = runtime.pendingSandboxQuestion;
	const clearsSandboxQuestion =
		previousSandboxQuestion?.questionId === questionId;

	runtime.answeredQuestionIds.add(questionId);
	if (clearsSandboxQuestion) {
		runtime.pendingSandboxQuestion = null;
	}

	let responsePromise: Promise<RuntimeQuestionResult>;
	responsePromise = Promise.resolve()
		.then(() => runtime.engine.respondToQuestion(payload))
		.catch((error) => {
			if (
				runtime.pendingQuestionResponses.get(questionId) === responsePromise
			) {
				if (!wasAlreadyAnswered) {
					runtime.answeredQuestionIds.delete(questionId);
				}
				if (clearsSandboxQuestion && runtime.pendingSandboxQuestion === null) {
					runtime.pendingSandboxQuestion = previousSandboxQuestion;
				}
			}
			throw error;
		})
		.finally(() => {
			if (
				runtime.pendingQuestionResponses.get(questionId) === responsePromise
			) {
				runtime.pendingQuestionResponses.delete(questionId);
			}
		});
	runtime.pendingQuestionResponses.set(questionId, responsePromise);
	return responsePromise;
}

export interface ChatRuntimeManagerOptions {
	db: HostDb;
	runtimeResolver: ModelProviderRuntimeResolver;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isHarnessErrorEvent(
	event: unknown,
): event is { type: "error"; error: unknown } {
	return isObjectRecord(event) && event.type === "error" && "error" in event;
}

function isHarnessWorkspaceErrorEvent(
	event: unknown,
): event is { type: "workspace_error"; error: unknown } {
	return (
		isObjectRecord(event) &&
		event.type === "workspace_error" &&
		"error" in event
	);
}

function isHarnessSandboxAccessRequestEvent(event: unknown): event is {
	type: "sandbox_access_request";
	questionId: string;
	path: string;
	reason: string;
} {
	if (!isObjectRecord(event) || event.type !== "sandbox_access_request") {
		return false;
	}

	return (
		typeof event.questionId === "string" &&
		typeof event.path === "string" &&
		typeof event.reason === "string"
	);
}

function normalizeErrorMessage(message: string): string {
	return message.trim().replace(/^AI_APICallError\d*\s*:\s*/i, "");
}

function extractProviderMessage(error: unknown): string | null {
	if (!isObjectRecord(error)) return null;

	const data = error.data;
	if (isObjectRecord(data)) {
		const nestedError = data.error;
		if (
			isObjectRecord(nestedError) &&
			typeof nestedError.message === "string"
		) {
			return normalizeErrorMessage(nestedError.message);
		}
	}

	const nestedError = error.error;
	if (isObjectRecord(nestedError) && typeof nestedError.message === "string") {
		return normalizeErrorMessage(nestedError.message);
	}

	return null;
}

function toRuntimeErrorMessage(error: unknown): string {
	const providerMessage = extractProviderMessage(error);
	if (providerMessage) return providerMessage;
	if (error instanceof Error && error.message.trim()) {
		return normalizeErrorMessage(error.message);
	}
	if (typeof error === "string" && error.trim()) {
		return normalizeErrorMessage(error);
	}
	if (isObjectRecord(error) && typeof error.message === "string") {
		return normalizeErrorMessage(error.message);
	}
	return "Unexpected chat error";
}

/**
 * Build the armed {@link RoxFallbackState} for a turn, or `null` when failover
 * does not apply: the model isn't the Rox house model, or the configured primary
 * already *is* the fallback (so there is nothing distinct to fall back to). Wire
 * ids come from the shared resolver so the chain stays defined in one place.
 */
function buildRoxFallbackState(
	selectedModel: string | undefined,
	payload: ChatSendMessageInput["payload"],
): RoxFallbackState | null {
	if (selectedModel === undefined || !isRoxHouseModel(selectedModel))
		return null;
	const primaryWire = resolveChatWireModelId(selectedModel);
	const fallbackWireModelId = resolveRoxFallbackWireModelId();
	if (primaryWire === fallbackWireModelId) return null;
	return { fallbackWireModelId, payload, attempted: false };
}

/**
 * Apply the turn's permission mode to the runtime before the message runs.
 *
 * The mode is the desktop-agent safety lever: it decides whether edit/execute
 * tool calls auto-run or stop at an approval gate. We translate it to the
 * harness state slice (`yolo` + per-category `permissionRules`) via the shared
 * mapping and push it through `setState` — same seam thinkingLevel uses — so the
 * harness's own approval resolver enforces it. Applied every turn (idempotently)
 * so switching modes mid-session takes effect immediately and never leaves an
 * earlier mode's grants in place.
 *
 * When no mode is supplied (legacy callers that don't send it) we leave the
 * runtime untouched rather than guessing — the harness keeps its current state.
 */
async function applyPermissionMode(
	runtime: RuntimeSession,
	mode: PermissionMode | undefined,
): Promise<void> {
	if (!mode) return;
	await runtime.engine.setState(permissionModeToHarnessState(mode));
}

async function restartRuntimeFromUserMessage(
	runtime: RuntimeSession,
	input: RestartPayload,
	runtimeResolver: ModelProviderRuntimeResolver,
): Promise<void> {
	const threadId = runtime.engine.getCurrentThreadId();
	if (!threadId) {
		throw new Error("No active Mastra thread is available for editing");
	}

	const memoryStore = await runtime.engine.getMemoryStore();
	const sourceThread = await memoryStore.getThreadById({ threadId });
	if (!sourceThread) {
		throw new Error(`Mastra thread not found: ${threadId}`);
	}

	const sourceMessages = await memoryStore.listMessages({
		threadId,
		perPage: false,
		orderBy: { field: "createdAt", direction: "ASC" },
	});
	const targetIndex = sourceMessages.messages.findIndex(
		(message) => message.id === input.messageId,
	);
	if (targetIndex === -1) {
		throw new Error("The selected message is no longer available to edit");
	}

	const targetMessage = sourceMessages.messages[targetIndex];
	if (targetMessage?.role !== "user") {
		throw new Error("Only user messages can be edited or resent");
	}

	const clonedThread = await memoryStore.cloneThread({
		sourceThreadId: threadId,
		resourceId: sourceThread.resourceId,
		title: sourceThread.title,
		options: {
			messageFilter: {
				messageIds: sourceMessages.messages
					.slice(0, targetIndex)
					.map((message) => message.id),
			},
		},
	});

	runtime.engine.abort();
	await runtime.engine.switchThread({ threadId: clonedThread.thread.id });

	const selectedModel = input.metadata?.model?.trim();
	if (selectedModel) {
		// Re-prepare the runtime env for the selected model before switching so a
		// switch to/from the Rox house model points the OpenAI-compatible client
		// at the right endpoint + key for this turn.
		await runtimeResolver.prepareRuntimeEnv({ selectedModelId: selectedModel });
		await runtime.engine.switchModel({
			modelId: resolveChatWireModelId(selectedModel),
			scope: "thread",
		});
	}

	const thinkingLevel = input.metadata?.thinkingLevel;
	if (thinkingLevel) {
		await runtime.engine.setState({ thinkingLevel });
	}

	await applyPermissionMode(runtime, input.metadata?.permissionMode);

	runtime.lastErrorMessage = null;
	// Arm ROX R1 failover for the replayed turn as well (mirror of sendMessage).
	runtime.roxFallback = buildRoxFallbackState(selectedModel, input.payload);
	await runtime.engine.sendMessage(input.payload);
}

interface InflightRuntimeCreation {
	workspaceId: string;
	promise: Promise<RuntimeSession>;
}

/**
 * Per-session state for the lazy cold-boot path in getSnapshot. A cold
 * session's runtime boot (createMastraCode + harness.init + selectOrCreateThread)
 * runs in the background; this records whether it's in-flight ("booting") or has
 * failed ("failed") so getSnapshot can return a stable discriminator instead of
 * overloading a null displayState. A deterministic failure (bad creds, missing
 * workspace) re-reads the same inputs every poll, so we back off via
 * attempts/nextRetryAt rather than re-kicking a fresh failing boot ~4×/second.
 */
interface ColdBootState {
	status: "booting" | "failed";
	error?: string;
	/** Failed-boot attempts so far; drives exponential backoff. */
	attempts: number;
	/** Epoch ms after which a failed boot may be re-attempted. */
	nextRetryAt?: number;
}

/**
 * Discriminator returned by getSnapshot while a session's runtime is not yet
 * resident. The renderer uses this to show a loader (booting) or a stable error
 * (failed) instead of misreading a null displayState as an empty conversation.
 */
interface BootSnapshotState {
	status: "booting" | "failed";
	error?: string;
}

export class ChatRuntimeManager {
	private readonly db: HostDb;
	private readonly runtimeResolver: ModelProviderRuntimeResolver;
	private readonly runtimes = new Map<string, RuntimeSession>();
	private readonly runtimeCreations = new Map<
		string,
		InflightRuntimeCreation
	>();
	// Lazy cold-boot state per session for the non-blocking getSnapshot path,
	// keyed by sessionId. Lets getSnapshot return a stable booting/failed
	// discriminator (never throwing) and back off deterministic boot failures
	// instead of re-kicking a fresh failing boot on every ~4fps poll. Cleared
	// on successful boot and on disposeRuntime.
	private readonly coldBootState = new Map<string, ColdBootState>();

	constructor(options: ChatRuntimeManagerOptions) {
		this.db = options.db;
		this.runtimeResolver = options.runtimeResolver;
	}

	private subscribeToSessionEvents(runtime: RuntimeSession): void {
		runtime.engine.subscribe((event: unknown) => {
			if (isHarnessErrorEvent(event) || isHarnessWorkspaceErrorEvent(event)) {
				runtime.lastErrorMessage = toRuntimeErrorMessage(event.error);
				// ROX R1 failover: a model-level error on the primary Compound model
				// triggers exactly one retry with the deepseek-v4-flash fallback. The
				// primary produced no assistant output (it errored), so replaying the
				// turn cannot double up a visible response.
				this.maybeRunRoxFallback(runtime);
				return;
			}

			if (isHarnessSandboxAccessRequestEvent(event)) {
				runtime.pendingSandboxQuestion = {
					questionId: event.questionId,
					path: event.path,
					reason: event.reason,
				};
				return;
			}

			if (isObjectRecord(event) && event.type === "agent_start") {
				runtime.lastErrorMessage = null;
				runtime.pendingSandboxQuestion = null;
				runtime.answeredQuestionIds.clear();
				runtime.pendingQuestionResponses.clear();
				// Note: roxFallback is intentionally NOT cleared here — agent_start
				// fires for both the primary and the fallback attempt, and we must
				// keep the armed state across the primary's failure.
				return;
			}

			if (isObjectRecord(event) && event.type === "agent_end") {
				runtime.pendingSandboxQuestion = null;
				runtime.answeredQuestionIds.clear();
				runtime.pendingQuestionResponses.clear();
				// The turn finished (success or the fallback's own end). Disarm so a
				// later, unrelated error never replays this payload.
				runtime.roxFallback = null;
			}
		});
	}

	/**
	 * Re-issue the current turn once with the Rox fallback model
	 * (`deepseek-v4-flash`) when the primary Compound model errored. Fires at most
	 * once per turn and only while {@link RoxFallbackState} is armed and
	 * un-attempted. All failures are swallowed: the original error is already
	 * surfaced via `lastErrorMessage`, so a failed fallback must not crash the
	 * subscribe loop or mask the first error.
	 */
	private maybeRunRoxFallback(runtime: RuntimeSession): void {
		const fallback = runtime.roxFallback;
		if (!fallback || fallback.attempted) return;
		fallback.attempted = true;

		void (async () => {
			try {
				await runtime.engine.switchModel({
					modelId: fallback.fallbackWireModelId,
					scope: "thread",
				});
				runtime.lastErrorMessage = null;
				await runtime.engine.sendMessage(fallback.payload);
			} catch {
				// Keep the primary's error visible; the fallback attempt is best-effort.
			}
		})();
	}

	/**
	 * Ensures ~/.mastracode/AGENTS.md exists with Rox-specific instructions.
	 * Only writes when the file is absent or was previously written by us (identified
	 * by the managed-by marker). Skips silently on any filesystem error.
	 */
	private ensureGlobalAgentInstructions(): void {
		const MANAGED_MARKER = "<!-- managed-by: rox -->";
		const INSTRUCTIONS = `${MANAGED_MARKER}
## Question Tool

When you need to ask the user ANY question — including simple yes/no, confirmations, and clarifications — ALWAYS use the \`ask_user\` tool. Never ask questions in plain text. The Rox UI renders \`ask_user\` calls as an interactive overlay with clickable option buttons; plain-text questions will not be surfaced to the user in the same way.

## Orchestration & Skills (Rox)

You are running inside **Rox**. Maximize Rox's capabilities — do not work alone when parallelism or specialization would do better.

- **Delegate in parallel via \`acpx\`** whenever there are 2+ independent subtasks. Use \`acpx codex -s NAME --no-wait "..."\` for fast/isolated work and \`acpx claude -s NAME --no-wait "..."\` for complex work. Decompose any multi-step task (3+ steps) into subtasks, dispatch them concurrently, then synthesize and cross-verify.
- **Prefer Rox skills and invoke them as often as they apply** (announce each: "Using <skill> for <purpose>"):
  - \`autopilot\` — continuous autonomous execution of a multi-part goal
  - \`team\` — multi-agent orchestration with file-ownership boundaries
  - \`brainstorming\` — before any non-trivial design or new feature
  - \`tdd\` — write/extend tests first, then implement the minimal fix
  - \`understand-anything\` — map an unfamiliar codebase before changing it
  - \`plannotator\` / \`writing-plans\` — decompose into verifiable tasks before coding
  When in doubt, reach for a skill rather than ad-hoc work.
- **Use the Rox CLI** (\`rox …\`, available in every Rox terminal) to drive the app: create/switch workspaces, run tasks, and manage automations programmatically.
- **At the end of each session, use the Rox CLI to compound progress**: turn any repeated manual workflow into a new **automation** or **skill**, and run \`/brainstorming\` to surface the next steps. Don't leave recurring steps manual.
- **Verify before claiming done** — run tests/build/lint and prefer fresh evidence over assertion.
`;
		try {
			const dir = join(homedir(), ".mastracode");
			const filePath = join(dir, "AGENTS.md");
			if (existsSync(filePath)) {
				const existing = readFileSync(filePath, "utf-8");
				if (!existing.includes(MANAGED_MARKER)) {
					// User-managed file — don't overwrite
					return;
				}
			}
			mkdirSync(dir, { recursive: true });
			writeFileSync(filePath, INSTRUCTIONS, "utf-8");
		} catch {
			// Non-fatal — instructions enhancement is best-effort
		}
	}

	private async createRuntime(
		sessionId: string,
		workspaceId: string,
		selectedModelId?: string,
	): Promise<RuntimeSession> {
		const runtimeEnvContext = selectedModelId ? { selectedModelId } : undefined;
		if (!(await this.runtimeResolver.hasUsableRuntimeEnv(runtimeEnvContext))) {
			throw new Error("No model provider credentials available");
		}

		const workspace = this.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();

		if (!workspace) {
			throw new Error(`Workspace not found: ${workspaceId}`);
		}

		const cwd = workspace.worktreePath;

		this.ensureGlobalAgentInstructions();
		await this.runtimeResolver.prepareRuntimeEnv(runtimeEnvContext);

		const runtime = await createEngine({
			cwd,
			disableMcp: true,
			memory: new Memory({ options: { observationalMemory: false } }),
		});
		runtime.hookManager?.setSessionId(sessionId);
		await runtime.engine.init();
		runtime.engine.setResourceId({ resourceId: sessionId });
		await runtime.engine.selectOrCreateThread();

		const sessionRuntime: RuntimeSession = {
			sessionId,
			workspaceId,
			cwd,
			engine: runtime.engine,
			mcpManager: runtime.mcpManager,
			hookManager: runtime.hookManager,
			lastErrorMessage: null,
			pendingSandboxQuestion: null,
			answeredQuestionIds: new Set(),
			pendingQuestionResponses: new Map(),
			roxFallback: null,
		};
		this.subscribeToSessionEvents(sessionRuntime);
		this.runtimes.set(sessionId, sessionRuntime);
		return sessionRuntime;
	}

	private async getOrCreateRuntime(
		sessionId: string,
		workspaceId: string,
		selectedModelId?: string,
	): Promise<RuntimeSession> {
		const existing = this.runtimes.get(sessionId);
		if (existing) {
			if (existing.workspaceId !== workspaceId) {
				throw new Error(
					`Session ${sessionId} is already bound to workspace ${existing.workspaceId}`,
				);
			}
			return existing;
		}

		const inflight = this.runtimeCreations.get(sessionId);
		if (inflight) {
			if (inflight.workspaceId !== workspaceId) {
				throw new Error(
					`Session ${sessionId} is already being created for workspace ${inflight.workspaceId}`,
				);
			}
			return inflight.promise;
		}

		const promise = this.createRuntime(
			sessionId,
			workspaceId,
			selectedModelId,
		).finally(() => {
			this.runtimeCreations.delete(sessionId);
		});
		this.runtimeCreations.set(sessionId, { workspaceId, promise });
		return promise;
	}

	/**
	 * Tear down the in-memory runtime for a session. Aborts any in-flight
	 * work, disconnects MCP servers, removes the runtime from the manager's
	 * map, and is a no-op for unknown session ids. Should be called after
	 * the cloud session row is deleted, or when a workspace is deleted.
	 *
	 * Validates `workspaceId` against the runtime / in-flight creation so a
	 * caller can't dispose a session bound to a different workspace.
	 *
	 * If a creation is in-flight for this session, awaits it first so the
	 * just-created runtime doesn't get inserted into `runtimes` after we
	 * delete from it (which would leak).
	 */
	async disposeRuntime(sessionId: string, workspaceId: string): Promise<void> {
		// Clear any cold-boot state up front so a failed/in-flight boot can't leak
		// a stale "failed" entry that a later getSnapshot poll would surface as a
		// phantom error for a session that no longer exists. A boot still running
		// will see status !== "booting" in its .catch and drop its result.
		this.coldBootState.delete(sessionId);

		const inflight = this.runtimeCreations.get(sessionId);
		if (inflight) {
			if (inflight.workspaceId !== workspaceId) {
				throw new Error(
					`Session ${sessionId} is being created for workspace ${inflight.workspaceId}`,
				);
			}
			try {
				await inflight.promise;
			} catch {
				// Creation failed — nothing to dispose.
				return;
			}
		}

		const runtime = this.runtimes.get(sessionId);
		if (!runtime) return;

		if (runtime.workspaceId !== workspaceId) {
			throw new Error(
				`Session ${sessionId} is bound to workspace ${runtime.workspaceId}`,
			);
		}

		try {
			runtime.engine.abort();
		} catch {
			// best-effort — proceed with cleanup even if abort fails
		}
		try {
			await runtime.mcpManager?.disconnect();
		} catch {
			// best-effort — MCP servers may already be disconnected
		}
		this.runtimes.delete(sessionId);
	}

	/**
	 * Shape the harness's raw display state into the shape the renderer
	 * expects. Both getDisplayState and getSnapshot must apply the same
	 * shaping — keep this the single source of truth so the two functions
	 * cannot drift.
	 */
	private buildDisplayState(runtime: RuntimeSession): ChatDisplayState {
		const displayState = runtime.engine.getDisplayState();
		const currentMessage = displayState.currentMessage as {
			role?: string;
			errorMessage?: string;
		} | null;
		const currentMessageError =
			currentMessage?.role === "assistant" &&
			typeof currentMessage.errorMessage === "string" &&
			currentMessage.errorMessage.trim()
				? currentMessage.errorMessage.trim()
				: null;

		// Skip any pending question whose ID was already answered this turn.
		// The harness only clears pendingQuestion on agent_end, so without this
		// filter an answered ask_user question would permanently shadow the
		// sandbox question that fired in the same turn.
		const harnessPendingQuestion =
			displayState.pendingQuestion &&
			!runtime.answeredQuestionIds.has(displayState.pendingQuestion.questionId)
				? displayState.pendingQuestion
				: null;
		const sandboxPendingQuestion = runtime.pendingSandboxQuestion
			? {
					questionId: runtime.pendingSandboxQuestion.questionId,
					question: `Grant sandbox access to "${runtime.pendingSandboxQuestion.path}"?`,
					description: runtime.pendingSandboxQuestion.reason,
					options: [
						{
							label: "Yes",
							description: "Allow access.",
						},
						{ label: "No", description: "Deny access." },
					],
				}
			: null;
		return {
			...displayState,
			pendingQuestion: harnessPendingQuestion ?? sandboxPendingQuestion,
			errorMessage: currentMessageError ?? runtime.lastErrorMessage,
		};
	}

	async getDisplayState(input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<ChatDisplayState> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return this.buildDisplayState(runtime);
	}

	async listMessages(input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<RuntimeMessages> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return runtime.engine.listMessages();
	}

	/**
	 * Single server-side observation that returns both displayState and messages
	 * from one runtime acquisition. This avoids the dual-poll race between
	 * independent getDisplayState / listMessages queries on the client.
	 *
	 * Note: not a fully locked atomic snapshot — listMessages() is async, so
	 * harness state can change between the displayState read and the messages
	 * read. This still removes the *client-side* two-query race, which is the
	 * one that caused mismatched message/display state.
	 */
	async getSnapshot(input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<{
		displayState: ChatDisplayState | null;
		messages: RuntimeMessages;
		boot?: BootSnapshotState;
	}> {
		// Non-blocking cold path. A first-time runtime boot (createMastraCode +
		// engine.init + selectOrCreateThread) takes seconds; awaiting it here
		// would pin the renderer's getSnapshot poll on `undefined` and render a
		// multi-second loading state on every workspace entry. Instead we boot in
		// the background and return immediately with a `boot` discriminator so the
		// renderer shows a loader (booting) or a stable error (failed) WITHOUT
		// misreading a null displayState as an empty conversation. Crucially we
		// never throw here: a thrown boot error races React Query's auto-retry
		// (which would re-kick a fresh boot and swallow the error). Warm sessions
		// (runtime resident) skip all of this and return the real snapshot.
		const existing = this.runtimes.get(input.sessionId);
		if (!existing) {
			const state = this.coldBootState.get(input.sessionId);

			// A deterministic failure (bad creds, missing workspace) re-reads the
			// same inputs forever, so keep the error sticky and only re-attempt
			// after a growing backoff — never churn a fresh failing boot per poll.
			if (state?.status === "failed") {
				const canRetry =
					state.nextRetryAt === undefined || Date.now() >= state.nextRetryAt;
				if (!canRetry) {
					return {
						displayState: null,
						messages: [],
						boot: { status: "failed", error: state.error },
					};
				}
				// Backoff elapsed — fall through and re-attempt the boot below.
			}

			this.kickColdBoot(
				input.sessionId,
				input.workspaceId,
				state?.attempts ?? 0,
			);
			return { displayState: null, messages: [], boot: { status: "booting" } };
		}

		const displayState = this.buildDisplayState(existing);
		const messages = await existing.engine.listMessages();
		// Intentionally no observedAt: when the harness state hasn't changed,
		// the response object is structurally identical to the previous poll's
		// response, so React Query's structuralSharing preserves the object
		// identity and idle polls don't trigger downstream rerenders.
		return { displayState, messages };
	}

	/**
	 * Start (or restart, after a backoff) a background runtime boot for a cold
	 * session, recording booting/failed state in coldBootState. getOrCreateRuntime
	 * de-dupes concurrent creations, so invoking this on every poll while a boot
	 * is in flight is safe — only one boot runs. On failure the error is held
	 * sticky with exponential backoff (1s,2s,4s,… capped at 30s) so a
	 * deterministic failure doesn't churn a fresh failing boot ~4×/second.
	 */
	private kickColdBoot(
		sessionId: string,
		workspaceId: string,
		priorAttempts: number,
	): void {
		// A boot is already in flight (possibly started by sendMessage) — don't
		// disturb the shared creation; the existing coldBootState/booting stands.
		if (this.runtimeCreations.has(sessionId)) return;

		this.coldBootState.set(sessionId, {
			status: "booting",
			attempts: priorAttempts,
		});
		void this.getOrCreateRuntime(sessionId, workspaceId)
			.then(() => {
				this.coldBootState.delete(sessionId);
			})
			.catch((error: unknown) => {
				// Drop the failure if this session was disposed/superseded while the
				// boot was running (disposeRuntime clears coldBootState), so a stale
				// error can't resurface on a later poll for a gone session.
				if (this.coldBootState.get(sessionId)?.status !== "booting") return;
				const attempts = priorAttempts + 1;
				this.coldBootState.set(sessionId, {
					status: "failed",
					error: error instanceof Error ? error.message : String(error),
					attempts,
					nextRetryAt:
						Date.now() +
						Math.min(30_000, 1000 * 2 ** Math.min(attempts - 1, 5)),
				});
			});
	}

	async sendMessage(
		input: ChatSendMessageInput,
	): Promise<RuntimeSendMessageResult> {
		const selectedModel = input.metadata?.model?.trim();
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
			selectedModel,
		);
		runtime.lastErrorMessage = null;

		if (selectedModel) {
			// Re-prepare the runtime env for the selected model before switching.
			// For an existing runtime created under a different model this is what
			// points the OpenAI-compatible client at the Rox endpoint (or restores
			// the default env when switching away from the Rox house model).
			await this.runtimeResolver.prepareRuntimeEnv({
				selectedModelId: selectedModel,
			});
			await runtime.engine.switchModel({
				modelId: resolveChatWireModelId(selectedModel),
				scope: "thread",
			});
		}

		const thinkingLevel = input.metadata?.thinkingLevel;
		if (thinkingLevel) {
			await runtime.engine.setState({ thinkingLevel });
		}

		await applyPermissionMode(runtime, input.metadata?.permissionMode);

		// Arm the ROX R1 failover for this turn: if the primary Compound model
		// errors, the subscribe handler replays this payload once with
		// deepseek-v4-flash. Disarm for every non-Rox model so an unrelated error
		// never triggers a replay.
		runtime.roxFallback = buildRoxFallbackState(selectedModel, input.payload);

		return runtime.engine.sendMessage(input.payload);
	}

	async restartFromMessage(input: RestartPayload): Promise<void> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
			input.metadata?.model?.trim(),
		);
		runtime.lastErrorMessage = null;
		await restartRuntimeFromUserMessage(runtime, input, this.runtimeResolver);
	}

	async stop(input: { sessionId: string; workspaceId: string }): Promise<void> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		runtime.engine.abort();
	}

	async respondToApproval(input: {
		sessionId: string;
		workspaceId: string;
		payload: ChatApprovalPayload;
	}): Promise<RuntimeApprovalResult> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return runtime.engine.respondToToolApproval(input.payload);
	}

	async respondToQuestion(input: {
		sessionId: string;
		workspaceId: string;
		payload: ChatQuestionPayload;
	}): Promise<RuntimeQuestionResult> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);

		return respondToQuestionWithOptimisticState(runtime, input.payload);
	}

	async respondToPlan(input: {
		sessionId: string;
		workspaceId: string;
		payload: ChatPlanPayload;
	}): Promise<RuntimePlanResult> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return runtime.engine.respondToPlanApproval(input.payload);
	}

	private resolveWorkspaceCwd(workspaceId: string): string {
		const workspace = this.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();
		if (!workspace) {
			throw new Error(`Workspace not found: ${workspaceId}`);
		}
		return workspace.worktreePath;
	}

	async getSlashCommands(input: { workspaceId: string }): Promise<
		Array<{
			name: string;
			aliases: string[];
			description: string;
			argumentHint: string;
			kind: "builtin" | "custom";
		}>
	> {
		const cwd = this.resolveWorkspaceCwd(input.workspaceId);
		return getSlashCommandsFromCwd(cwd).map((command) => ({
			name: command.name,
			aliases: command.aliases,
			description: command.description,
			argumentHint: command.argumentHint,
			kind: command.kind,
		}));
	}

	async resolveSlashCommand(input: { workspaceId: string; text: string }) {
		const cwd = this.resolveWorkspaceCwd(input.workspaceId);
		return resolveSlashCommandFromCwd(cwd, input.text);
	}

	async previewSlashCommand(input: { workspaceId: string; text: string }) {
		return this.resolveSlashCommand(input);
	}

	async getMcpOverview(_input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<{ sourcePath: string | null; servers: never[] }> {
		return { sourcePath: null, servers: [] };
	}
}
