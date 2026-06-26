/**
 * {@link MastraEngine} — the mastracode-backed {@link Engine} implementation.
 *
 * A thin 1:1 pass-through: every method forwards verbatim to the wrapped
 * mastracode `Harness`. The only non-forwarding member is
 * {@link MastraEngine.getMemoryStore}, which encapsulates the previous
 * `harness.config.storage.getStore("memory")` reach-in behind the typed
 * {@link Engine} method.
 *
 * {@link createMastraEngine} is the {@link EngineFactory} for this engine: it
 * builds the mastracode bundle via `createMastraCode` and wraps the harness.
 * It is the only engine factory today; a future `omp` engine would add a sibling
 * factory implementing the same {@link EngineBundle}.
 *
 * Pure refactor: no behavior change.
 */

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
} from "./engine";

/**
 * Structural view of the harness used to reach the memory store. Mastracode does
 * not expose `config.storage` on the public `Harness` type, so this mirrors the
 * shape the previous call-site reach-in relied on.
 */
interface HarnessWithConfig {
	config?: {
		storage?: {
			getStore: (domain: "memory") => Promise<EngineMemoryStore | null>;
		};
	};
}

/**
 * Wraps a mastracode `Harness` as an {@link Engine}, forwarding every call 1:1.
 */
export class MastraEngine implements Engine<MastraEngineState> {
	constructor(private readonly harness: MastraHarness) {}

	init(): Promise<void> {
		return this.harness.init();
	}

	selectOrCreateThread(): Promise<unknown> {
		return this.harness.selectOrCreateThread();
	}

	destroy(): Promise<void> {
		const harnessWithDestroy = this.harness as MastraHarness & {
			destroy?: () => Promise<void>;
		};
		return harnessWithDestroy.destroy?.() ?? Promise.resolve();
	}

	setResourceId(args: { resourceId: string }): void {
		this.harness.setResourceId(args);
	}

	getCurrentThreadId(): string | null {
		return this.harness.getCurrentThreadId();
	}

	switchThread(args: { threadId: string }): Promise<void> {
		return this.harness.switchThread(args);
	}

	switchModel(args: {
		modelId: string;
		scope?: "global" | "thread";
		modeId?: string;
	}): Promise<void> {
		return this.harness.switchModel(args);
	}

	getFullModelId(): string {
		return this.harness.getFullModelId();
	}

	getState(): Readonly<MastraEngineState> {
		return this.harness.getState();
	}

	setState(updates: Partial<MastraEngineState>): Promise<void> {
		return this.harness.setState(updates);
	}

	getCurrentMode(): EngineMode<MastraEngineState> {
		return this.harness.getCurrentMode();
	}

	sendMessage(args: {
		content: string;
		files?: Array<{
			data: string;
			mediaType: string;
			filename?: string;
		}>;
	}): Promise<void> {
		return this.harness.sendMessage(args);
	}

	listMessages(options?: { limit?: number }): Promise<HarnessMessage[]> {
		return this.harness.listMessages(options);
	}

	saveSystemReminderMessage(args: {
		message: string;
		reminderType: string;
		role?: "user" | "assistant" | "system";
		metadata?: Record<string, unknown>;
	}): Promise<HarnessMessage | null> {
		return this.harness.saveSystemReminderMessage(args);
	}

	getDisplayState(): Readonly<HarnessDisplayState> {
		return this.harness.getDisplayState();
	}

	abort(): void {
		this.harness.abort();
	}

	respondToToolApproval(args: {
		decision: "approve" | "decline" | "always_allow_category";
	}): void {
		this.harness.respondToToolApproval(args);
	}

	respondToQuestion(args: {
		questionId: string;
		answer: HarnessQuestionAnswer;
	}): void {
		this.harness.respondToQuestion(args);
	}

	respondToPlanApproval(args: {
		planId: string;
		response: {
			action: "approved" | "rejected";
			feedback?: string;
		};
	}): Promise<void> {
		return this.harness.respondToPlanApproval(args);
	}

	subscribe(listener: (event: unknown) => void | Promise<void>): () => void {
		// The harness types events as `HarnessEvent`; call sites here narrow from
		// `unknown` via their own type guards, so widen the listener param.
		return this.harness.subscribe(
			listener as Parameters<MastraHarness["subscribe"]>[0],
		);
	}

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
}

/**
 * {@link EngineFactory} for the mastracode engine: builds the mastracode bundle
 * and wraps its harness as a {@link MastraEngine}. Forwards `config` straight to
 * `createMastraCode` and surfaces the surrounding managers/helpers on the
 * returned {@link EngineBundle}.
 */
export async function createMastraEngine(
	config?: EngineConfig,
): Promise<EngineBundle> {
	const bundle = await createMastraCode(config);
	return {
		engine: new MastraEngine(bundle.harness),
		mcpManager: bundle.mcpManager,
		hookManager: bundle.hookManager,
		authStorage: bundle.authStorage,
		resolveModel: bundle.resolveModel,
	};
}
