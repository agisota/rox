/**
 * {@link OmpEngine} — an {@link Engine} implementation that drives `oh-my-pi`
 * (`omp --mode rpc`) as a headless subprocess. It is a drop-in for
 * {@link MastraEngine}: same method surface, same argument/return shapes, so it
 * slots in behind `createEngine` with no edits to the tRPC service, host-service
 * runtime manager, UI, or call sites.
 *
 * ## Composition
 *
 * omp owns the *conversation* (the LLM turn loop). Everything around the turn —
 * thread/resource identity, persisted memory store, state schema, the title
 * agent for `getCurrentMode`, and the MCP/hook/auth managers the
 * {@link EngineBundle} must surface — is provided by a mastracode `Harness`
 * built via `createMastraCode`. So {@link OmpEngine} wraps both:
 *
 *   - `harness`     → init, threads (identity + memory-store clone), state,
 *                     mode (title agent), memory store, getFullModelId, and the
 *                     persistence side of saveSystemReminderMessage.
 *   - `ompProcess`  → sendMessage (+ image attachments + reminder injection),
 *                     listMessages, getDisplayState, subscribe, abort,
 *                     respondToToolApproval, respondToQuestion (input/confirm),
 *                     switchModel (respawn), and session continuity for
 *                     switchThread (switch_session / new_session).
 *
 * This keeps every type honest (real `HarnessMessage`/`HarnessMode`/state) while
 * the actual model turns go to omp.
 *
 * ## Verified RPC contract (live `omp/15.11.0` spike)
 *
 *   spawn: `omp --mode rpc --approval-mode always-ask --model <id>
 *           --session-dir <dir>` (+ provider key in env). Wait for
 *           `{"type":"ready"}` before sending.
 *   stdin (JSONL, each `{id,type,...}`): `prompt{message,images?}`,
 *           `steer{message}`, `follow_up{message}`, `abort`,
 *           `abort_and_prompt{message}`, `get_state`, `get_messages`,
 *           `extension_ui_response{id,value|confirmed}`.
 *   pull replies: `{id,type:"response",command,success,data}` — result under
 *           `.data`. `get_state.data.{isStreaming,messageCount,sessionId,
 *           sessionFile,…}`; `get_messages.data.messages[]`.
 *   attachments: `prompt.images:[{data:<base64>, mimeType}]` (omp's
 *           `ImageContent`; images only — no arbitrary-file channel). omp spreads
 *           them into the user message and forwards to the provider (live: a PNG
 *           round-trips and the model sees it).
 *   session continuity: each session persists to a `.jsonl` under `--session-dir`
 *           surfaced as `get_state.data.sessionFile`. `new_session{}` → fresh
 *           session (history cleared); `switch_session{sessionPath}` → restore a
 *           saved session's full history; `branch{entryId}` → fork the current
 *           session truncated before that entry (the edit-resend primitive), with
 *           `get_branch_messages` → `{messages:[{entryId,text}]}` (one per user
 *           turn). All return `data.{cancelled,…}`.
 *   questions: `extension_ui_request{id,method:"input",title,placeholder}` /
 *           `{method:"confirm",title,message}` → FLAT reply
 *           `extension_ui_response{id,value}` (input) / `{id,confirmed}` (confirm).
 *   no plan/inject: the full RPC command set has NO plan-approval command and NO
 *           append/inject-message command — system reminders are prepended to the
 *           next `prompt` as `<system-reminder>` blocks; plan approval is
 *           best-effort (harness-forward + optional steer).
 *   push: `agent_start` … (1+ `turn_start`/`message_*`/`turn_end`) … `agent_end`.
 *           NB: `agent_end` = run finished (NOT turn_end); one prompt may span
 *           several turns. `message_update.assistantMessageEvent` carries a full
 *           `partial` snapshot (idempotent). Errors arrive as
 *           `message.stopReason:"error"` + `message.errorMessage`/`errorStatus`.
 *   approvals: `extension_ui_request{id,method:"select",title,options}` →
 *           `extension_ui_response{id,value:"Approve"|"Deny"}` (blocking,
 *           default-deny). Side-channel `method` values (`setWidget`,
 *           `setStatus`, `notify`) are ignored.
 *   host tools: the Rox `extraTools` are exposed to the omp agent via the
 *           host-tool sub-protocol (verified against `omp/15.11.0`):
 *             register (host→omp): `set_host_tools{tools:[{name,label?,
 *               description,parameters:JSONSchema,hidden?}]}` → response
 *               `{toolNames:[…]}`. Sent once the child is ready; survives
 *               `--no-extensions`. omp rejects a tool with an empty
 *               name/description or non-object `parameters`.
 *             call (omp→host): `host_tool_call{id,toolCallId,toolName,arguments}`.
 *             result (host→omp): `host_tool_result{id,result:{content:[{type:
 *               "text",text}]}}`; on failure add top-level `isError:true`.
 *               Optional progress: `host_tool_update{id,partialResult}`.
 *             cancel (omp→host): `host_tool_cancel{id,targetId}` aborts the
 *               in-flight call `targetId`.
 *   budget: omp inlines discovered skills/rules into its system prompt; with a
 *           large global setup this overflows tight provider budgets (groq
 *           small/mid models → HTTP 400 "reduce the length of the messages",
 *           NOT the tool schema). `--no-skills --no-rules` is the default trim
 *           (see ROX_OMP_KEEP_SKILLS).
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	HarnessDisplayState,
	HarnessMessage,
	HarnessQuestionAnswer,
} from "@mastra/core/harness";
import { createMastraCode } from "mastracode";
import type {
	Engine,
	EngineBundle,
	EngineConfig,
	EngineMemoryStore,
	EngineMode,
	MastraEngineState,
	MastraHarness,
} from "../engine";
import {
	buildDisplayState,
	buildHostToolDefinitions,
	buildHostToolErrorResult,
	composeMessageWithReminders,
	mapAgentMessage,
	mapAgentMessages,
	mapHostToolResult,
	type OmpAgentMessage,
	type OmpHostToolDefinition,
	type OmpPromptImage,
	type OmpStateData,
	partitionPromptAttachments,
	type RoxFileAttachment,
	type RoxHostTool,
	summarizeUnsupportedAttachments,
} from "./omp-mapping";
import { resolveOmpModelRouting } from "./omp-models";
import { OmpProcess, type OmpPushEvent } from "./omp-process";

/** Reuse of the mastra storage reach-in shape (mastracode hides it on the type). */
interface HarnessWithConfig {
	config?: {
		storage?: {
			getStore: (domain: "memory") => Promise<EngineMemoryStore | null>;
		};
	};
}

/** A Harness event re-emitted to subscribers (matches the shapes runtime.ts narrows). */
type EmittedEvent = Record<string, unknown> & { type: string };

/** omp `extension_ui_request` frame (the blocking gate + side channels). */
interface OmpExtensionUiRequest {
	type: "extension_ui_request";
	id: string;
	method: string;
	title?: string;
	options?: string[];
	[key: string]: unknown;
}

/** omp `host_tool_call` frame: a request for the host to run a registered tool. */
interface OmpHostToolCall {
	type: "host_tool_call";
	/** Correlation id for the host_tool_result reply. */
	id: string;
	/** The agent-side tool-call id (for the host's execution context). */
	toolCallId: string;
	/** The registered host-tool name to execute. */
	toolName: string;
	/** Parsed tool arguments. */
	arguments: Record<string, unknown>;
}

/** omp `host_tool_cancel` frame: a previously-issued host_tool_call was aborted. */
interface OmpHostToolCancel {
	type: "host_tool_cancel";
	id: string;
	/** The `id` of the host_tool_call being cancelled. */
	targetId: string;
}

/** omp side-channel UI methods that are NOT user-blocking — ignore them. */
const SIDE_CHANNEL_UI_METHODS = new Set([
	"setWidget",
	"setStatus",
	"notify",
	"available_commands_update",
]);

/**
 * Drives omp as a subprocess behind the {@link Engine} interface, delegating the
 * non-conversational surface to a wrapped mastracode {@link MastraHarness}.
 */
export class OmpEngine implements Engine<MastraEngineState> {
	private ompProcess: OmpProcess | null = null;
	private readonly sessionDir: string;
	private readonly cwd: string;

	/** Latest streaming assistant message (for getDisplayState.currentMessage). */
	private currentMessage: HarnessMessage | null = null;
	/** Tool awaiting approval (omp `select`), correlated by extension-ui id. */
	private pendingApproval: HarnessDisplayState["pendingApproval"] = null;
	private pendingApprovalUiId: string | null = null;
	/** Question awaiting answer (omp `input`/`confirm`), correlated by id. */
	private pendingQuestion: HarnessDisplayState["pendingQuestion"] = null;
	private pendingQuestionUiId: string | null = null;

	private readonly listeners = new Set<
		(event: unknown) => void | Promise<void>
	>();

	/**
	 * Maps a Rox thread id → the omp session `.jsonl` path that holds that
	 * thread's omp conversation. Lets {@link switchThread} restore omp's live
	 * history (via `switch_session`) when returning to a previously-seen thread,
	 * so omp's session follows the active Rox thread instead of starting empty.
	 * Populated after each turn from `get_state().sessionFile`.
	 */
	private readonly threadSessionFiles = new Map<string, string>();

	/**
	 * System reminders buffered for injection on the next `prompt`. omp's RPC
	 * command set has no inject-message frame, so reminders are prepended to the
	 * next user message as `<system-reminder>` blocks (see
	 * {@link saveSystemReminderMessage}).
	 */
	private pendingReminders: string[] = [];

	/**
	 * Extra args appended to every omp spawn (after the base flags). Lets the host
	 * constrain the headless child — e.g. `--tools none` / `--system-prompt` for
	 * provider/model combos whose budget can't fit omp's full default tool schema.
	 * Defaults to none.
	 */
	private readonly ompExtraArgs: string[];

	/**
	 * The Rox host tools (mastra MCP `listTools()` record) to expose to omp over
	 * the host-tool sub-protocol. Registered via `set_host_tools` once the child
	 * is ready; invoked on each `host_tool_call`. Keyed by tool name (= omp tool
	 * id). Empty when the host runs no extra tools (e.g. the host-service path).
	 */
	private readonly extraTools: Record<string, RoxHostTool>;
	/** Pre-translated omp host-tool definitions (computed once from extraTools). */
	private readonly hostToolDefinitions: OmpHostToolDefinition[];
	/** Abort controllers for in-flight host_tool_call executions, keyed by call id. */
	private readonly hostToolControllers = new Map<string, AbortController>();

	constructor(
		private readonly harness: MastraHarness,
		private readonly authStorage: EngineBundle["authStorage"],
		options: {
			cwd: string;
			ompExtraArgs?: string[];
			extraTools?: Record<string, RoxHostTool>;
		},
	) {
		this.cwd = options.cwd;
		this.ompExtraArgs = options.ompExtraArgs ?? [];
		this.extraTools = options.extraTools ?? {};
		this.hostToolDefinitions = buildHostToolDefinitions(this.extraTools);
		this.sessionDir = mkdtempSync(join(tmpdir(), "rox-omp-"));
	}

	// ── Lifecycle ────────────────────────────────────────────────────────────

	async init(): Promise<void> {
		// Bring up the mastra harness (storage/workspace/threads/state) first; omp
		// is spawned lazily on the first turn (or model switch) so we know the
		// resolved model id and avoid an idle child for sessions that never send.
		await this.harness.init();
	}

	selectOrCreateThread(): Promise<unknown> {
		return this.harness.selectOrCreateThread();
	}

	async destroy(): Promise<void> {
		this.abortHostToolCalls();
		this.ompProcess?.destroy();
		this.ompProcess = null;
		const harnessWithDestroy = this.harness as MastraHarness & {
			destroy?: () => Promise<void>;
		};
		await harnessWithDestroy.destroy?.();
	}

	/** Abort and drop any in-flight host_tool_call executions (teardown/respawn). */
	private abortHostToolCalls(): void {
		for (const controller of this.hostToolControllers.values()) {
			controller.abort();
		}
		this.hostToolControllers.clear();
	}

	// ── Identity / threads ───────────────────────────────────────────────────

	setResourceId(args: { resourceId: string }): void {
		this.harness.setResourceId(args);
	}

	getCurrentThreadId(): string | null {
		return this.harness.getCurrentThreadId();
	}

	async switchThread(args: { threadId: string }): Promise<void> {
		// The mastra harness still owns thread identity (memory-store edit/resend
		// clones a thread, then drives this method — see runtime.ts), so forward
		// first. Then move omp's *live* session to follow the active Rox thread:
		// switch to the session file we recorded for that thread, or start a fresh
		// omp session when the thread is new to omp. This makes omp's conversation
		// history track the thread instead of starting empty on every switch.
		this.currentMessage = null;
		this.pendingReminders = [];
		this.clearPendingInteractions();
		await this.harness.switchThread(args);
		await this.followThreadInOmpSession(args.threadId);
	}

	/**
	 * Move omp's live session to the one recorded for `threadId`. When the child
	 * isn't running there is nothing to do — {@link ensureOmpStarted} will spawn
	 * fresh on the next turn and {@link recordThreadSessionFile} will bind the new
	 * session to whatever thread is active then. Best-effort: a failed switch
	 * leaves omp on its current session (logged under OMP_ENGINE_DEBUG) rather
	 * than blocking the thread change.
	 */
	private async followThreadInOmpSession(threadId: string): Promise<void> {
		const omp = this.ompProcess;
		if (!omp?.isReady) return;
		try {
			const mapped = this.threadSessionFiles.get(threadId);
			if (mapped) {
				const current = await this.readOmpSessionFile(omp);
				if (current === mapped) return; // already on this thread's session
				await omp.switchSession(mapped);
			} else {
				// Unknown thread → fresh omp session so its history starts clean.
				// TODO(omp): edit-resend loses prior context here. runtime.ts clones the
				// mastra thread (history before the edited message) and drives
				// switchThread({threadId}) → sendMessage(editedPayload). But the Engine
				// contract (engine.ts switchThread) carries only the threadId, NOT the
				// edited messageId, so we cannot map it onto omp's native branch{entryId}
				// edit primitive (omp.branch + omp.getBranchMessages ARE wired and tested,
				// just undrivable from this signal). The mastra path needs no id (its
				// thread IS its history); omp's live session is a separate state machine.
				// True parity needs an optional fromMessageId on switchThread (mastra
				// ignores it, omp branches on it) OR replaying the cloned thread's prior
				// user turns as omp --system-prompt priming on the next spawn (passive
				// context, no extra agent runs). Until then the edited prompt runs against
				// an empty omp session — answered, but without prior conversational context.
				await omp.newSession();
			}
			this.lastStateData = { ...this.lastStateData, isStreaming: false };
			await this.recordThreadSessionFile(threadId, omp);
		} catch (error) {
			if (process.env.OMP_ENGINE_DEBUG) {
				console.error("[omp] followThreadInOmpSession failed", error);
			}
		}
	}

	/** Read the current omp session `.jsonl` path from `get_state`, or null. */
	private async readOmpSessionFile(omp: OmpProcess): Promise<string | null> {
		try {
			const data = await omp.request<OmpStateData>("get_state");
			return typeof data?.sessionFile === "string" ? data.sessionFile : null;
		} catch {
			return null;
		}
	}

	/** Record the omp session file currently backing `threadId` (best-effort). */
	private async recordThreadSessionFile(
		threadId: string,
		omp: OmpProcess,
	): Promise<void> {
		const sessionFile = await this.readOmpSessionFile(omp);
		if (sessionFile) this.threadSessionFiles.set(threadId, sessionFile);
	}

	// ── Model / state ────────────────────────────────────────────────────────

	async switchModel(args: {
		modelId: string;
		scope?: "global" | "thread";
		modeId?: string;
	}): Promise<void> {
		await this.harness.switchModel(args);
		// omp has no verified runtime model-switch frame, so respawn the child with
		// the new --model on next turn. Tear the current one down; ensureOmpStarted
		// re-reads getFullModelId() and re-registers host tools.
		if (this.ompProcess) {
			this.abortHostToolCalls();
			this.ompProcess.destroy();
			this.ompProcess = null;
			this.currentMessage = null;
		}
	}

	getFullModelId(): string {
		return this.harness.getFullModelId();
	}

	getState(): Readonly<MastraEngineState> {
		return this.harness.getState();
	}

	setState(updates: Partial<MastraEngineState>): Promise<void> {
		// thinkingLevel and friends live on the mastra state schema; forward there.
		// omp does not expose a verified runtime thinking-level frame, so this is
		// best-effort for the omp turn (it affects the next respawn's defaults only
		// if reflected in the model id). TODO(omp): map thinkingLevel → omp --slow
		// / reasoning effort when a runtime frame is confirmed.
		return this.harness.setState(updates);
	}

	getCurrentMode(): EngineMode<MastraEngineState> {
		return this.harness.getCurrentMode();
	}

	// ── Conversation (omp-driven) ────────────────────────────────────────────

	async sendMessage(args: {
		content: string;
		files?: Array<{ data: string; mediaType: string; filename?: string }>;
	}): Promise<void> {
		const omp = await this.ensureOmpStarted();
		// Reset transient state for the new run.
		this.currentMessage = null;
		this.clearPendingInteractions();

		// Image attachments map to omp's native `prompt.images` ({data, mimeType});
		// non-image files have no omp rpc channel, so summarize them as a note so
		// the model is at least aware (verified: omp's `prompt` accepts images
		// only). Then drain any buffered system reminders into the message body.
		const files = (args.files ?? []) as RoxFileAttachment[];
		const { images, unsupported } = partitionPromptAttachments(files);
		const note = summarizeUnsupportedAttachments(unsupported);
		const baseContent = note ? `${args.content}\n\n${note}` : args.content;
		const message = composeMessageWithReminders(
			baseContent,
			this.pendingReminders,
		);
		this.pendingReminders = [];

		const payload: { message: string; images?: OmpPromptImage[] } = { message };
		if (images.length > 0) payload.images = images;
		await omp.request("prompt", payload);

		// Bind this turn's omp session file to the active thread so a later
		// switchThread can return to it (best-effort; never blocks the prompt).
		const threadId = this.harness.getCurrentThreadId();
		if (threadId) void this.recordThreadSessionFile(threadId, omp);
	}

	async listMessages(_options?: { limit?: number }): Promise<HarnessMessage[]> {
		const omp = this.ompProcess;
		if (!omp || !omp.isReady) return [];
		const data = await omp.request<{ messages?: OmpAgentMessage[] }>(
			"get_messages",
		);
		return mapAgentMessages(data?.messages ?? []);
	}

	async saveSystemReminderMessage(args: {
		message: string;
		reminderType: string;
		role?: "user" | "assistant" | "system";
		metadata?: Record<string, unknown>;
	}): Promise<HarnessMessage | null> {
		// omp's RPC command set has no inject-message frame (verified against the
		// full handleCommand dispatcher), so a reminder cannot be persisted as its
		// own omp turn. Buffer it for injection as a `<system-reminder>` block on
		// the next `prompt` (see sendMessage) — that is how the reminder reaches
		// omp's live model context. Still forward to the mastra harness so the
		// memory store stays the source of truth for reminder persistence/history.
		if (args.message.trim()) this.pendingReminders.push(args.message);
		const harnessWithReminder = this.harness as MastraHarness & {
			saveSystemReminderMessage?: (
				a: typeof args,
			) => Promise<HarnessMessage | null>;
		};
		return (
			(await harnessWithReminder.saveSystemReminderMessage?.(args)) ?? null
		);
	}

	getDisplayState(): Readonly<HarnessDisplayState> {
		// Synchronous contract: return the last snapshot assembled from omp push
		// events. `isRunning` is kept current by agent_start/agent_end; the live
		// `get_state` pull is used by listMessages/poll paths, not here.
		return buildDisplayState({
			state: this.lastStateData,
			currentMessage: this.currentMessage,
			pendingApproval: this.pendingApproval,
			pendingQuestion: this.pendingQuestion,
		});
	}

	abort(): void {
		this.ompProcess?.notify("abort");
	}

	// ── Interaction responses ────────────────────────────────────────────────

	respondToToolApproval(args: {
		decision: "approve" | "decline" | "always_allow_category";
	}): void {
		if (!this.ompProcess || !this.pendingApprovalUiId) return;
		// omp's built-in select gate has two options; map Rox decisions onto them.
		// "always_allow_category" has no omp-side persistent equivalent over rpc, so
		// treat it as an approve for this call. TODO(omp): persist per-tool
		// `tools.approval` allow when a runtime frame is confirmed.
		const value = args.decision === "decline" ? "Deny" : "Approve";
		this.ompProcess.respondToExtensionUi(this.pendingApprovalUiId, value);
		this.pendingApproval = null;
		this.pendingApprovalUiId = null;
	}

	respondToQuestion(args: {
		questionId: string;
		answer: HarnessQuestionAnswer;
	}): void {
		if (!this.ompProcess || this.pendingQuestionUiId !== args.questionId) {
			return;
		}
		// Answer omp's blocking dialog in its method's FLAT shape (verified live +
		// against omp's `RpcExtensionUIResponse`): `input` → `{id, value}`,
		// `confirm` → `{id, confirmed}` (respondToExtensionUi spreads the object at
		// the top level — never nested under `value`). We stored the method
		// alongside the id when the request arrived.
		const answerText = Array.isArray(args.answer)
			? args.answer.join(", ")
			: String(args.answer ?? "");
		const answer =
			this.pendingQuestionMethod === "confirm"
				? { confirmed: /^(y|yes|true|approve|confirm)/i.test(answerText) }
				: { value: answerText };
		this.ompProcess.respondToExtensionUi(this.pendingQuestionUiId, answer);
		this.pendingQuestion = null;
		this.pendingQuestionUiId = null;
		this.pendingQuestionMethod = null;
	}

	async respondToPlanApproval(args: {
		planId: string;
		response: { action: "approved" | "rejected"; feedback?: string };
	}): Promise<void> {
		// TODO(omp): omp's RPC surface has NO plan-approval concept — the full
		// `handleCommand` dispatcher (verified against omp/15.11.0) exposes no
		// plan/approve_plan/submit_plan command and no plan-mode extension-ui
		// method, so there is genuinely nothing to map a Rox plan decision onto.
		// Best-effort: forward to the mastra harness (which owns plan state for the
		// non-omp path) so the seam stays intact; when an omp turn is mid-flight we
		// additionally steer the decision in as text so the running agent sees it.
		const harnessWithPlan = this.harness as MastraHarness & {
			respondToPlanApproval?: (a: typeof args) => Promise<void>;
		};
		await harnessWithPlan.respondToPlanApproval?.(args);

		if (this.ompProcess?.isReady && this.lastStateData.isStreaming) {
			const verdict =
				args.response.action === "approved"
					? "The plan is approved. Proceed."
					: "The plan is rejected. Do not proceed.";
			const feedback = args.response.feedback?.trim();
			const steer = feedback ? `${verdict} ${feedback}` : verdict;
			try {
				this.ompProcess.notify("steer", { message: steer });
			} catch (error) {
				if (process.env.OMP_ENGINE_DEBUG) {
					console.error("[omp] plan-approval steer failed", error);
				}
			}
		}
	}

	// ── Events ───────────────────────────────────────────────────────────────

	subscribe(listener: (event: unknown) => void | Promise<void>): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	// ── Persistence reach-in ──────────────────────────────────────────────────

	async getMemoryStore(): Promise<EngineMemoryStore> {
		const harness = this.harness as unknown as HarnessWithConfig;
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

	// ── Internals ─────────────────────────────────────────────────────────────

	/** Last `get_state`-equivalent snapshot, refreshed from push lifecycle. */
	private lastStateData: OmpStateData = { isStreaming: false };
	/** Method of the in-flight question (`input` | `confirm`). */
	private pendingQuestionMethod: string | null = null;

	/** Spawn (or reuse) the omp child for the current model, waiting for ready. */
	private async ensureOmpStarted(): Promise<OmpProcess> {
		if (this.ompProcess?.isReady) return this.ompProcess;
		if (this.ompProcess) this.ompProcess.destroy();

		const wireModelId = this.harness.getFullModelId();
		const routing = resolveOmpModelRouting(wireModelId);
		const env = await this.buildChildEnv(
			routing.envVar,
			routing.authProviderId,
		);

		const omp = new OmpProcess({
			model: routing.ompModelId,
			cwd: this.cwd,
			env,
			sessionDir: this.sessionDir,
			extraArgs: this.buildOmpExtraArgs(),
		});
		omp.subscribe((event) => this.onOmpEvent(event));
		this.ompProcess = omp;
		await omp.start();
		// Register host-owned tools (the Rox `extraTools`) before the first turn so
		// they are in omp's session tool registry when the model is prompted. omp's
		// host-tool sub-protocol is independent of `--no-extensions`, verified live.
		await this.registerHostTools(omp);
		return omp;
	}

	/**
	 * Compose the extra args appended to every omp spawn. Disables extension and
	 * (by default) skill/rule discovery: those inline a large skills/rules corpus
	 * into omp's system prompt, which is what overflows tight provider request
	 * budgets (e.g. groq's HTTP 400 "reduce the length of the messages" — NOT the
	 * tool schema). Host-supplied {@link ompExtraArgs} follow and can re-enable.
	 */
	private buildOmpExtraArgs(): string[] {
		// `--no-extensions`: the autoresearch/setWidget side channel adds noise and
		// the host owns its own tools (registered via set_host_tools).
		const base = ["--no-extensions"];
		if (OMP_BUDGET_TRIM_DEFAULT) base.push("--no-skills", "--no-rules");
		return [...base, ...this.ompExtraArgs];
	}

	/**
	 * Register the Rox host tools with the omp child via `set_host_tools`. No-op
	 * when there are no tools. Re-sending replaces omp's host-owned set, so this
	 * is also safe to call again after a respawn. Failure is non-fatal: the turn
	 * proceeds without host tools (logged under OMP_ENGINE_DEBUG) rather than
	 * blocking the conversation.
	 */
	private async registerHostTools(omp: OmpProcess): Promise<void> {
		if (this.hostToolDefinitions.length === 0) return;
		try {
			await omp.request("set_host_tools", {
				tools: this.hostToolDefinitions,
			});
		} catch (error) {
			if (process.env.OMP_ENGINE_DEBUG) {
				console.error("[omp] set_host_tools failed", error);
			}
		}
	}

	/**
	 * Build the child env: inherit the parent env, then ensure the active
	 * provider's API-key var is populated from mastracode authStorage (preferred)
	 * or the existing process env. Reuses Rox's credential resolution so the omp
	 * child authenticates with the same keys the mastra path would.
	 */
	private async buildChildEnv(
		envVar: string | null,
		authProviderId: string | null,
	): Promise<NodeJS.ProcessEnv> {
		const env: NodeJS.ProcessEnv = { ...process.env };
		if (!envVar) return env;
		if (env[envVar]) return env; // already set on the parent

		if (authProviderId) {
			try {
				this.authStorage.reload();
				const key = await this.authStorage.getApiKey(authProviderId);
				if (key) env[envVar] = key;
			} catch {
				// best-effort; fall through to whatever the parent env had
			}
		}
		return env;
	}

	private clearPendingInteractions(): void {
		this.pendingApproval = null;
		this.pendingApprovalUiId = null;
		this.pendingQuestion = null;
		this.pendingQuestionUiId = null;
		this.pendingQuestionMethod = null;
	}

	/** Translate one omp push frame into Rox state updates + emitted Harness events. */
	private onOmpEvent(event: OmpPushEvent): void {
		switch (event.type) {
			case "agent_start":
				this.lastStateData = { ...this.lastStateData, isStreaming: true };
				this.currentMessage = null;
				this.clearPendingInteractions();
				this.emit({ type: "agent_start" });
				return;

			case "agent_end": {
				this.lastStateData = { ...this.lastStateData, isStreaming: false };
				const reason = this.deriveAgentEndReason(event);
				this.clearPendingInteractions();
				this.emit({ type: "agent_end", reason });
				return;
			}

			case "message_update":
				this.handleMessageUpdate(event);
				return;

			case "message_end": {
				const message = (event as { message?: OmpAgentMessage }).message;
				if (message && message.role === "assistant") {
					this.currentMessage = mapAgentMessage(message);
					// Surface an error turn as a Harness `error` event so runtime.ts can
					// set lastErrorMessage. omp reports it on the message itself.
					if (message.stopReason === "error" || message.errorMessage) {
						this.emit({
							type: "error",
							error: new Error(message.errorMessage ?? "omp turn failed"),
						});
					}
				}
				return;
			}

			case "extension_ui_request":
				this.handleExtensionUiRequest(event as OmpExtensionUiRequest);
				return;

			case "host_tool_call":
				// Fire-and-forget: the async executor replies host_tool_result by id.
				void this.handleHostToolCall(event as unknown as OmpHostToolCall);
				return;

			case "host_tool_cancel":
				this.handleHostToolCancel(event as unknown as OmpHostToolCancel);
				return;

			default:
				// turn_start/turn_end/tool_execution_*/auto_compaction_*/response are
				// not individually surfaced; the message_* + agent_* stream is enough
				// for Rox's polling-based UI.
				return;
		}
	}

	/**
	 * Execute a Rox host tool requested by omp and reply with `host_tool_result`,
	 * correlating by the call `id`. Resolves the tool by `toolName` from the
	 * registered {@link extraTools}; runs its `execute(arguments, {toolCallId,
	 * signal})`; maps the result to omp's content shape on success, or replies
	 * with `isError:true` on a missing tool or a thrown error. Never throws into
	 * the event loop.
	 */
	private async handleHostToolCall(call: OmpHostToolCall): Promise<void> {
		const omp = this.ompProcess;
		if (!omp) return;

		const tool = this.extraTools[call.toolName];
		if (!tool || typeof tool.execute !== "function") {
			omp.sendHostToolResult(
				call.id,
				buildHostToolErrorResult(
					new Error(`Host tool "${call.toolName}" is not registered`),
				),
				true,
			);
			return;
		}

		const controller = new AbortController();
		this.hostToolControllers.set(call.id, controller);
		try {
			const result = await tool.execute(call.arguments, {
				toolCallId: call.toolCallId,
				signal: controller.signal,
			});
			if (controller.signal.aborted) return;
			omp.sendHostToolResult(call.id, mapHostToolResult(result));
		} catch (error) {
			if (controller.signal.aborted) return;
			omp.sendHostToolResult(call.id, buildHostToolErrorResult(error), true);
		} finally {
			this.hostToolControllers.delete(call.id);
		}
	}

	/** Abort an in-flight host_tool_call when omp reports it was cancelled. */
	private handleHostToolCancel(cancel: OmpHostToolCancel): void {
		const controller = this.hostToolControllers.get(cancel.targetId);
		if (controller) {
			controller.abort();
			this.hostToolControllers.delete(cancel.targetId);
		}
	}

	private handleMessageUpdate(event: OmpPushEvent): void {
		const assistantEvent = (
			event as {
				assistantMessageEvent?: { partial?: OmpAgentMessage };
			}
		).assistantMessageEvent;
		const partial = assistantEvent?.partial;
		if (partial) {
			// `partial` is a full idempotent snapshot — safe to map wholesale.
			this.currentMessage = mapAgentMessage(partial);
		}
	}

	private handleExtensionUiRequest(event: OmpExtensionUiRequest): void {
		if (SIDE_CHANNEL_UI_METHODS.has(event.method)) return;

		if (event.method === "select") {
			// Built-in tool gate: title is "Allow tool: <name>\n<details>".
			const toolName = this.parseToolNameFromTitle(event.title);
			this.pendingApprovalUiId = event.id;
			this.pendingApproval = {
				toolCallId: event.id,
				toolName,
				args: { title: event.title, options: event.options },
			};
			this.emit({
				type: "tool_approval_required",
				toolCallId: event.id,
				toolName,
				args: { title: event.title, options: event.options },
			});
			return;
		}

		if (event.method === "input" || event.method === "confirm") {
			this.pendingQuestionUiId = event.id;
			this.pendingQuestionMethod = event.method;
			this.pendingQuestion = {
				questionId: event.id,
				question: event.title ?? "",
				options: event.options?.map((label) => ({ label, value: label })),
			};
			this.emit({
				type: "ask_question",
				questionId: event.id,
				question: event.title ?? "",
				options: event.options?.map((label) => ({ label, value: label })),
			});
		}
	}

	private parseToolNameFromTitle(title: string | undefined): string {
		if (!title) return "tool";
		const match = title.match(/Allow tool:\s*([^\n]+)/i);
		return match?.[1]?.trim() ?? title.split("\n")[0] ?? "tool";
	}

	private deriveAgentEndReason(
		event: OmpPushEvent,
	): "complete" | "aborted" | "error" {
		const messages = (event as { messages?: OmpAgentMessage[] }).messages;
		const last = messages?.[messages.length - 1];
		if (last?.stopReason === "error" || last?.errorMessage) return "error";
		if (last?.stopReason === "aborted") return "aborted";
		return "complete";
	}

	private emit(event: EmittedEvent): void {
		for (const listener of this.listeners) {
			try {
				void listener(event);
			} catch {
				// listeners narrow from unknown and must not throw into the engine
			}
		}
	}
}

/** Env var: extra args appended to every omp spawn (space-separated). */
export const ROX_OMP_EXTRA_ARGS_ENV = "ROX_OMP_EXTRA_ARGS";

/**
 * Env var to control omp's skill/rule budget trim. The omp child auto-discovers
 * the machine's global skills/rules and inlines them into its system prompt;
 * with a large global setup this can be multiple MB, overflowing tight provider
 * request budgets (groq small/mid models return HTTP 400 "reduce the length of
 * the messages"). Defaulting `--no-skills --no-rules` keeps headless runs small.
 * Set `ROX_OMP_KEEP_SKILLS=1` (or `=true`) to opt back in.
 */
export const ROX_OMP_KEEP_SKILLS_ENV = "ROX_OMP_KEEP_SKILLS";

/** True unless the host opts skills/rules back in via {@link ROX_OMP_KEEP_SKILLS_ENV}. */
const OMP_BUDGET_TRIM_DEFAULT = !/^(1|true|yes)$/i.test(
	process.env[ROX_OMP_KEEP_SKILLS_ENV]?.trim() ?? "",
);

/** Parse {@link ROX_OMP_EXTRA_ARGS_ENV} into an arg list (simple space split). */
function readOmpExtraArgs(): string[] {
	const raw = process.env[ROX_OMP_EXTRA_ARGS_ENV]?.trim();
	if (!raw) return [];
	return raw.split(/\s+/).filter(Boolean);
}

/** The `extraTools` field of {@link EngineConfig}, with `undefined` stripped. */
type EngineExtraTools = NonNullable<EngineConfig>["extraTools"];

/**
 * Resolve `config.extraTools` to the static host-tool record. mastracode also
 * accepts a `(ctx) => record` function form, but omp's `set_host_tools` is a
 * one-shot registration with no per-request-context resolution, so only the
 * static record is bridged; the function form is skipped (host tools stay off
 * for that session). The tRPC service path always supplies the static record.
 */
function resolveExtraTools(
	extraTools: EngineExtraTools,
): Record<string, RoxHostTool> {
	if (extraTools && typeof extraTools === "object") {
		return extraTools as Record<string, RoxHostTool>;
	}
	return {};
}

/**
 * {@link EngineFactory} for the omp engine. Builds the mastracode bundle (for
 * the surrounding managers + the non-conversational engine surface) and wraps
 * its harness as an {@link OmpEngine}. The returned {@link EngineBundle} mirrors
 * the mastra one exactly, so `createEngine` can return either interchangeably.
 *
 * The host's `extraTools` (the Rox MCP/tool record) are bridged to omp over the
 * host-tool sub-protocol, so the omp agent can call back into Rox's tools.
 * Host-tunable headless flags come from {@link ROX_OMP_EXTRA_ARGS_ENV} (e.g.
 * `--tools none` for provider/model combos with tight token budgets); skill/rule
 * inlining is trimmed by default (see {@link ROX_OMP_KEEP_SKILLS_ENV}).
 */
export async function createOmpEngine(
	config?: EngineConfig,
): Promise<EngineBundle> {
	const bundle = await createMastraCode(config);
	const cwd = config?.cwd ?? process.cwd();
	return {
		engine: new OmpEngine(bundle.harness, bundle.authStorage, {
			cwd,
			ompExtraArgs: readOmpExtraArgs(),
			extraTools: resolveExtraTools(config?.extraTools),
		}),
		mcpManager: bundle.mcpManager,
		hookManager: bundle.hookManager,
		authStorage: bundle.authStorage,
		resolveModel: bundle.resolveModel,
	};
}
