/**
 * Pluggable agent {@link Engine} interface.
 *
 * This is the engine-agnostic seam between Rox's chat plumbing (tRPC service,
 * host-service runtime manager, shared runtime helpers) and the underlying agent
 * runtime. Today the only implementation is {@link MastraEngine}, a 1:1
 * pass-through over mastracode's `createMastraCode` harness. The interface exists
 * so a future engine (e.g. an `omp`-backed one) can be slotted in behind
 * {@link createEngine} without touching the UI, tRPC procedures, or call sites.
 *
 * The method surface mirrors exactly the `Harness` methods Rox calls — same
 * names, same argument/return shapes — re-exported here so call sites depend on
 * `Engine` instead of reaching into mastracode types directly. The one
 * deliberate addition is {@link Engine.getMemoryStore}, which replaces the
 * previous reach-in through `harness.config.storage.getStore("memory")` with a
 * typed method so call sites no longer touch engine internals.
 *
 * Pure refactor: this introduces no behavior. Every {@link MastraEngine} method
 * forwards verbatim to the wrapped harness.
 */

import type {
	HarnessDisplayState,
	HarnessMessage,
	HarnessMode,
	HarnessQuestionAnswer,
} from "@mastra/core/harness";
import type { createMastraCode } from "mastracode";

/**
 * The mastracode bundle returned by `createMastraCode`. Aliased so the engine
 * types stay in lockstep with the installed mastracode version without
 * re-declaring its (large) inline state shape.
 */
type MastraCodeBundle = Awaited<ReturnType<typeof createMastraCode>>;

/** The concrete mastracode `Harness` instance from the bundle. */
export type MastraHarness = MastraCodeBundle["harness"];

/**
 * The harness state shape (model ids, thinkingLevel, permission rules, tasks,
 * …). Defaulted as the {@link Engine} state type so callers get the real field
 * set; a future engine can supply its own state type via the generic parameter.
 */
export type MastraEngineState = ReturnType<MastraHarness["getState"]>;

/** Mode descriptor returned by {@link Engine.getCurrentMode}. */
export type EngineMode<TState> = HarnessMode<TState>;

/**
 * A persisted thread row, as surfaced by the memory store. Mirrors the minimal
 * fields Rox reads when cloning a thread for message-edit/resend.
 */
export interface EngineStoredThread {
	id: string;
	resourceId: string;
	title?: string;
}

/** A persisted message row (id + role) from the memory store. */
export interface EngineStoredMessage {
	id: string;
	role: string;
}

/**
 * The typed memory store, replacing the previous
 * `harness.config.storage.getStore("memory")` reach-in. Methods and argument
 * shapes match mastracode's store exactly so behavior is unchanged.
 */
export interface EngineMemoryStore {
	getThreadById(args: { threadId: string }): Promise<EngineStoredThread | null>;
	listMessages(args: {
		threadId: string;
		perPage: false;
		orderBy: { field: "createdAt"; direction: "ASC" };
	}): Promise<{ messages: EngineStoredMessage[] }>;
	cloneThread(args: {
		sourceThreadId: string;
		resourceId?: string;
		title?: string;
		options?: {
			messageFilter?: {
				messageIds?: string[];
			};
		};
	}): Promise<{ thread: EngineStoredThread }>;
}

/**
 * The engine-agnostic agent runtime contract.
 *
 * Captures exactly the `Harness` surface Rox uses. Defaults its state generic to
 * {@link MastraEngineState}; a non-mastra engine can implement `Engine<TOwnState>`.
 */
export interface Engine<TState = MastraEngineState> {
	// ── Lifecycle ──────────────────────────────────────────────────────────
	/** Initialize the engine — loads storage and workspace. */
	init(): Promise<void>;
	/** Select the most recent thread, or create one if none exist. */
	selectOrCreateThread(): Promise<unknown>;
	/** Tear down the engine. Optional — not every engine needs teardown. */
	destroy?(): Promise<void>;

	// ── Identity / threads ─────────────────────────────────────────────────
	/** Bind threads to a resource (Rox session) id. */
	setResourceId(args: { resourceId: string }): void;
	/** The current thread id, or null when none is active. */
	getCurrentThreadId(): string | null;
	/** Switch to an existing thread by id. */
	switchThread(args: { threadId: string }): Promise<void>;

	// ── Model / state ──────────────────────────────────────────────────────
	/** Switch the active model at runtime. */
	switchModel(args: {
		modelId: string;
		scope?: "global" | "thread";
		modeId?: string;
	}): Promise<void>;
	/** The full model id (e.g. "anthropic/claude-sonnet-4"). */
	getFullModelId(): string;
	/** Read-only snapshot of engine state. */
	getState(): Readonly<TState>;
	/** Update engine state (validated against the engine's schema). */
	setState(updates: Partial<TState>): Promise<void>;
	/** The current mode descriptor (used for title generation). */
	getCurrentMode(): EngineMode<TState>;

	// ── Conversation ───────────────────────────────────────────────────────
	/** Send a user message to the current agent. */
	sendMessage(args: {
		content: string;
		files?: Array<{
			data: string;
			mediaType: string;
			filename?: string;
		}>;
	}): Promise<void>;
	/** List messages for the current thread. */
	listMessages(options?: { limit?: number }): Promise<HarnessMessage[]>;
	/** Persist a system-reminder message (used for memory-context injection). */
	saveSystemReminderMessage(args: {
		message: string;
		reminderType: string;
		role?: "user" | "assistant" | "system";
		metadata?: Record<string, unknown>;
	}): Promise<HarnessMessage | null>;
	/** Read-only snapshot of canonical display state. */
	getDisplayState(): Readonly<HarnessDisplayState>;
	/** Abort the current operation. */
	abort(): void;

	// ── Interaction responses ──────────────────────────────────────────────
	/** Respond to a pending tool approval. */
	respondToToolApproval(args: {
		decision: "approve" | "decline" | "always_allow_category";
	}): void;
	/** Respond to a pending `ask_user` question. */
	respondToQuestion(args: {
		questionId: string;
		answer: HarnessQuestionAnswer;
	}): void;
	/** Respond to a pending plan approval. */
	respondToPlanApproval(args: {
		planId: string;
		response: {
			action: "approved" | "rejected";
			feedback?: string;
		};
	}): Promise<void>;

	// ── Events ─────────────────────────────────────────────────────────────
	/** Subscribe to engine events. Returns an unsubscribe function. */
	subscribe(listener: (event: unknown) => void | Promise<void>): () => void;

	// ── Persistence reach-in (typed) ───────────────────────────────────────
	/**
	 * The thread/message memory store. Replaces the previous
	 * `harness.config.storage.getStore("memory")` reach-in so call sites stay
	 * off engine internals. Rejects when storage/memory is unavailable.
	 */
	getMemoryStore(): Promise<EngineMemoryStore>;
}

/**
 * The bundle a {@link createEngine} factory returns: the {@link Engine} plus the
 * surrounding runtime managers and auth/model helpers from the underlying
 * runtime. Mirrors the `createMastraCode` return so nothing the call sites need
 * is lost behind the seam.
 */
export interface EngineBundle {
	engine: Engine;
	mcpManager: MastraCodeBundle["mcpManager"];
	hookManager: MastraCodeBundle["hookManager"];
	authStorage: MastraCodeBundle["authStorage"];
	resolveModel: MastraCodeBundle["resolveModel"];
}

/**
 * Configuration accepted by a {@link createEngine} factory. Passed straight
 * through to the underlying runtime; today this is mastracode's
 * `MastraCodeConfig`.
 */
export type EngineConfig = Parameters<typeof createMastraCode>[0];

/** The shape of a {@link createEngine} implementation. */
export type EngineFactory = (config?: EngineConfig) => Promise<EngineBundle>;
