import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Memory } from "@mastra/memory";
import {
	getSlashCommands as getSlashCommandsFromCwd,
	resolveSlashCommand as resolveSlashCommandFromCwd,
} from "@rox/chat/server/desktop";
import {
	isRoxHouseModel,
	resolveChatWireModelId,
	resolveRoxFallbackWireModelId,
} from "@rox/shared/chat-models";
import { eq } from "drizzle-orm";
import { createMastraCode } from "mastracode";
import type { HostDb } from "../../db";
import { workspaces } from "../../db/schema";
import type { ModelProviderRuntimeResolver } from "../../providers/model-providers";

type RuntimeHarness = Awaited<ReturnType<typeof createMastraCode>>["harness"];
type RuntimeMcpManager = Awaited<
	ReturnType<typeof createMastraCode>
>["mcpManager"];
type RuntimeHookManager = Awaited<
	ReturnType<typeof createMastraCode>
>["hookManager"];
type RuntimeDisplayState = ReturnType<RuntimeHarness["getDisplayState"]>;
type RuntimeMessages = Awaited<ReturnType<RuntimeHarness["listMessages"]>>;
type RuntimeSendMessageResult = Awaited<
	ReturnType<RuntimeHarness["sendMessage"]>
>;
type RuntimeApprovalResult = Awaited<
	ReturnType<RuntimeHarness["respondToToolApproval"]>
>;
type RuntimeQuestionResult = Awaited<
	ReturnType<RuntimeHarness["respondToQuestion"]>
>;
type RuntimePlanResult = Awaited<
	ReturnType<RuntimeHarness["respondToPlanApproval"]>
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
	harness: RuntimeHarness;
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
		.then(() => runtime.harness.respondToQuestion(payload))
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

interface RuntimeStoredMessage {
	id: string;
	role: string;
}

interface RuntimeStoredThread {
	id: string;
	resourceId: string;
	title?: string;
}

interface RuntimeMemoryStore {
	getThreadById(args: {
		threadId: string;
	}): Promise<RuntimeStoredThread | null>;
	listMessages(args: {
		threadId: string;
		perPage: false;
		orderBy: { field: "createdAt"; direction: "ASC" };
	}): Promise<{ messages: RuntimeStoredMessage[] }>;
	cloneThread(args: {
		sourceThreadId: string;
		resourceId?: string;
		title?: string;
		options?: {
			messageFilter?: {
				messageIds?: string[];
			};
		};
	}): Promise<{ thread: RuntimeStoredThread }>;
}

interface HarnessWithConfig {
	config?: {
		storage?: {
			getStore: (domain: "memory") => Promise<RuntimeMemoryStore | null>;
		};
	};
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
	if (!isRoxHouseModel(selectedModel)) return null;
	const primaryWire = resolveChatWireModelId(selectedModel);
	const fallbackWireModelId = resolveRoxFallbackWireModelId();
	if (primaryWire === fallbackWireModelId) return null;
	return { fallbackWireModelId, payload, attempted: false };
}

async function getRuntimeMemoryStore(
	runtime: RuntimeSession,
): Promise<RuntimeMemoryStore> {
	const harness = runtime.harness as unknown as HarnessWithConfig;
	const storage = harness.config?.storage;
	if (!storage) {
		throw new Error("Mastra storage is not configured for this session");
	}

	const memoryStore = await storage.getStore("memory");
	if (!memoryStore) {
		throw new Error("Mastra memory storage is unavailable for this session");
	}

	return memoryStore;
}

async function restartRuntimeFromUserMessage(
	runtime: RuntimeSession,
	input: RestartPayload,
	runtimeResolver: ModelProviderRuntimeResolver,
): Promise<void> {
	const threadId = runtime.harness.getCurrentThreadId();
	if (!threadId) {
		throw new Error("No active Mastra thread is available for editing");
	}

	const memoryStore = await getRuntimeMemoryStore(runtime);
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

	runtime.harness.abort();
	await runtime.harness.switchThread({ threadId: clonedThread.thread.id });

	const selectedModel = input.metadata?.model?.trim();
	if (selectedModel) {
		// Re-prepare the runtime env for the selected model before switching so a
		// switch to/from the Rox house model points the OpenAI-compatible client
		// at the right endpoint + key for this turn.
		await runtimeResolver.prepareRuntimeEnv({ selectedModelId: selectedModel });
		await runtime.harness.switchModel({
			modelId: resolveChatWireModelId(selectedModel),
			scope: "thread",
		});
	}

	const thinkingLevel = input.metadata?.thinkingLevel;
	if (thinkingLevel) {
		await runtime.harness.setState({ thinkingLevel });
	}

	runtime.lastErrorMessage = null;
	// Arm ROX R1 failover for the replayed turn as well (mirror of sendMessage).
	runtime.roxFallback = buildRoxFallbackState(selectedModel, input.payload);
	await runtime.harness.sendMessage(input.payload);
}

interface InflightRuntimeCreation {
	workspaceId: string;
	promise: Promise<RuntimeSession>;
}

export class ChatRuntimeManager {
	private readonly db: HostDb;
	private readonly runtimeResolver: ModelProviderRuntimeResolver;
	private readonly runtimes = new Map<string, RuntimeSession>();
	private readonly runtimeCreations = new Map<
		string,
		InflightRuntimeCreation
	>();

	constructor(options: ChatRuntimeManagerOptions) {
		this.db = options.db;
		this.runtimeResolver = options.runtimeResolver;
	}

	private subscribeToSessionEvents(runtime: RuntimeSession): void {
		runtime.harness.subscribe((event: unknown) => {
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
				await runtime.harness.switchModel({
					modelId: fallback.fallbackWireModelId,
					scope: "thread",
				});
				runtime.lastErrorMessage = null;
				await runtime.harness.sendMessage(fallback.payload);
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

		const runtime = await createMastraCode({
			cwd,
			disableMcp: true,
			memory: new Memory({ options: { observationalMemory: false } }),
		});
		runtime.hookManager?.setSessionId(sessionId);
		await runtime.harness.init();
		runtime.harness.setResourceId({ resourceId: sessionId });
		await runtime.harness.selectOrCreateThread();

		const sessionRuntime: RuntimeSession = {
			sessionId,
			workspaceId,
			cwd,
			harness: runtime.harness,
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
			runtime.harness.abort();
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
		const displayState = runtime.harness.getDisplayState();
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
		return runtime.harness.listMessages();
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
		displayState: ChatDisplayState;
		messages: RuntimeMessages;
	}> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		const displayState = this.buildDisplayState(runtime);
		const messages = await runtime.harness.listMessages();
		// Intentionally no observedAt: when the harness state hasn't changed,
		// the response object is structurally identical to the previous poll's
		// response, so React Query's structuralSharing preserves the object
		// identity and idle polls don't trigger downstream rerenders.
		return { displayState, messages };
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
			await runtime.harness.switchModel({
				modelId: resolveChatWireModelId(selectedModel),
				scope: "thread",
			});
		}

		const thinkingLevel = input.metadata?.thinkingLevel;
		if (thinkingLevel) {
			await runtime.harness.setState({ thinkingLevel });
		}

		// Arm the ROX R1 failover for this turn: if the primary Compound model
		// errors, the subscribe handler replays this payload once with
		// deepseek-v4-flash. Disarm for every non-Rox model so an unrelated error
		// never triggers a replay.
		runtime.roxFallback = buildRoxFallbackState(selectedModel, input.payload);

		return runtime.harness.sendMessage(input.payload);
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
		runtime.harness.abort();
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
		return runtime.harness.respondToToolApproval(input.payload);
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
		return runtime.harness.respondToPlanApproval(input.payload);
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
