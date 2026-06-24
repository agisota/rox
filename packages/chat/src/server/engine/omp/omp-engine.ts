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
 *   - `harness`     → init, threads, state, mode (title agent), memory store,
 *                     getFullModelId, saveSystemReminderMessage.
 *   - `ompProcess`  → sendMessage, listMessages, getDisplayState, subscribe,
 *                     abort, respondToToolApproval, switchModel (respawn).
 *
 * This keeps every type honest (real `HarnessMessage`/`HarnessMode`/state) while
 * the actual model turns go to omp.
 *
 * ## Verified RPC contract (live `omp/15.11.0` spike)
 *
 *   spawn: `omp --mode rpc --approval-mode always-ask --model <id>
 *           --session-dir <dir>` (+ provider key in env). Wait for
 *           `{"type":"ready"}` before sending.
 *   stdin (JSONL, each `{id,type,...}`): `prompt{message}`, `steer{message}`,
 *           `follow_up{message}`, `abort`, `abort_and_prompt{message}`,
 *           `get_state`, `get_messages`, `extension_ui_response{id,value}`.
 *   pull replies: `{id,type:"response",command,success,data}` — result under
 *           `.data`. `get_state.data.{isStreaming,messageCount,sessionId,…}`;
 *           `get_messages.data.messages[]`.
 *   push: `agent_start` … (1+ `turn_start`/`message_*`/`turn_end`) … `agent_end`.
 *           NB: `agent_end` = run finished (NOT turn_end); one prompt may span
 *           several turns. `message_update.assistantMessageEvent` carries a full
 *           `partial` snapshot (idempotent). Errors arrive as
 *           `message.stopReason:"error"` + `message.errorMessage`/`errorStatus`.
 *   approvals: `extension_ui_request{id,method:"select",title,options}` →
 *           `extension_ui_response{id,value:"Approve"|"Deny"}` (blocking,
 *           default-deny). Side-channel `method` values (`setWidget`,
 *           `setStatus`, `notify`) are ignored.
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
	mapAgentMessage,
	mapAgentMessages,
	type OmpAgentMessage,
	type OmpStateData,
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
	 * Extra args appended to every omp spawn (after the base flags). Lets the host
	 * constrain the headless child — e.g. `--tools none` / `--system-prompt` for
	 * provider/model combos whose budget can't fit omp's full default tool schema.
	 * Defaults to none.
	 */
	private readonly ompExtraArgs: string[];

	constructor(
		private readonly harness: MastraHarness,
		private readonly authStorage: EngineBundle["authStorage"],
		options: { cwd: string; ompExtraArgs?: string[] },
	) {
		this.cwd = options.cwd;
		this.ompExtraArgs = options.ompExtraArgs ?? [];
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
		this.ompProcess?.destroy();
		this.ompProcess = null;
		const harnessWithDestroy = this.harness as MastraHarness & {
			destroy?: () => Promise<void>;
		};
		await harnessWithDestroy.destroy?.();
	}

	// ── Identity / threads ───────────────────────────────────────────────────

	setResourceId(args: { resourceId: string }): void {
		this.harness.setResourceId(args);
	}

	getCurrentThreadId(): string | null {
		return this.harness.getCurrentThreadId();
	}

	switchThread(args: { threadId: string }): Promise<void> {
		// TODO(omp): bridge thread switching to omp `switch_session`/`branch` so the
		// child's conversation follows the active Rox thread. Today the mastra
		// harness tracks thread identity (used by memory-store edit/resend) while
		// omp keeps its own ephemeral session; respawn drops omp's history, matching
		// a fresh thread. Cross-thread omp history continuity is not yet wired.
		this.currentMessage = null;
		return this.harness.switchThread(args);
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
		// re-reads getFullModelId().
		if (this.ompProcess) {
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

		// omp's `prompt` does not currently accept file attachments over rpc; inline
		// a note so the model is aware. TODO(omp): forward files once omp rpc
		// supports a typed attachment field on `prompt`.
		const message =
			args.files && args.files.length > 0
				? `${args.content}\n\n[${args.files.length} attached file(s) omitted: omp rpc file passthrough not yet wired]`
				: args.content;

		await omp.request("prompt", { message });
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
		// TODO(omp): persist a system-reminder turn into omp's session. omp rpc has
		// no verified "inject message" frame, so fall back to the mastra harness's
		// own reminder persistence (keeps memory-context injection working at the
		// store level even though omp's live session won't show the reminder).
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
		// omp `input` expects {value}; `confirm` expects {confirmed}. We stored the
		// method alongside the id; answer in the matching shape.
		const answerText = Array.isArray(args.answer)
			? args.answer.join(", ")
			: args.answer;
		const value =
			this.pendingQuestionMethod === "confirm"
				? { confirmed: /^(y|yes|true|approve|confirm)/i.test(answerText) }
				: { value: answerText };
		this.ompProcess.respondToExtensionUi(this.pendingQuestionUiId, value);
		this.pendingQuestion = null;
		this.pendingQuestionUiId = null;
		this.pendingQuestionMethod = null;
	}

	async respondToPlanApproval(args: {
		planId: string;
		response: { action: "approved" | "rejected"; feedback?: string };
	}): Promise<void> {
		// TODO(omp): omp surfaces plan approval through its own `submit_plan` /
		// extension-ui flow rather than a typed plan-approval frame. No verified
		// mapping yet — forward to the mastra harness so the seam stays intact.
		const harnessWithPlan = this.harness as MastraHarness & {
			respondToPlanApproval?: (a: typeof args) => Promise<void>;
		};
		await harnessWithPlan.respondToPlanApproval?.(args);
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
			// No extensions over rpc: the autoresearch/setWidget side channel adds
			// noise and the host owns its own tools. Host-supplied extras follow.
			extraArgs: ["--no-extensions", ...this.ompExtraArgs],
		});
		omp.subscribe((event) => this.onOmpEvent(event));
		this.ompProcess = omp;
		await omp.start();
		return omp;
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

			default:
				// turn_start/turn_end/tool_execution_*/auto_compaction_*/response are
				// not individually surfaced; the message_* + agent_* stream is enough
				// for Rox's polling-based UI.
				return;
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

/** Parse {@link ROX_OMP_EXTRA_ARGS_ENV} into an arg list (simple space split). */
function readOmpExtraArgs(): string[] {
	const raw = process.env[ROX_OMP_EXTRA_ARGS_ENV]?.trim();
	if (!raw) return [];
	return raw.split(/\s+/).filter(Boolean);
}

/**
 * {@link EngineFactory} for the omp engine. Builds the mastracode bundle (for
 * the surrounding managers + the non-conversational engine surface) and wraps
 * its harness as an {@link OmpEngine}. The returned {@link EngineBundle} mirrors
 * the mastra one exactly, so `createEngine` can return either interchangeably.
 *
 * Host-tunable headless flags come from {@link ROX_OMP_EXTRA_ARGS_ENV} (e.g.
 * `--tools none` for provider/model combos with tight token budgets).
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
		}),
		mcpManager: bundle.mcpManager,
		hookManager: bundle.hookManager,
		authStorage: bundle.authStorage,
		resolveModel: bundle.resolveModel,
	};
}
