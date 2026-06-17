import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";

/**
 * Capability + ranking metadata for the model picker.
 *
 * The picker shows non-technical users which models can see images, call tools,
 * handle long documents, etc., plus a coarse "power" score so the strongest
 * model surfaces first. The catalog below is keyed by the canonical model id
 * used across the Rox gateway (the same ids served at `api.zed.md/v1/models`
 * and carried in {@link AVAILABLE_CHAT_MODELS}); unknown ids — including models
 * discovered from a user's custom OpenAI-compatible endpoint — fall back to a
 * name-based heuristic so they still render sensible badges and ordering.
 */

/** A single human-readable capability badge. */
export type ModelCapability =
	| "vision"
	| "imageGen"
	| "video"
	| "tools"
	| "longContext"
	| "reasoning";

export interface ModelCapabilityMeta {
	/** Capabilities surfaced as badges, in display order. */
	capabilities: ModelCapability[];
	/** Context window in tokens (used for the "long context" label + sort). */
	contextWindowTokens: number;
	/**
	 * Coarse 0-100 capability/power score. Drives the strength bar and the
	 * within-provider ranking. Hand-tuned per known model; heuristic otherwise.
	 */
	strength: number;
}

/** Russian labels for each capability badge (product UI language is RU). */
export const CAPABILITY_LABELS: Record<ModelCapability, string> = {
	vision: "Зрение",
	imageGen: "Картинки",
	video: "Видео",
	tools: "Инструменты",
	longContext: "Длинный контекст",
	reasoning: "Рассуждение",
};

const TOKENS_PER_K = 1000;
const LONG_CONTEXT_THRESHOLD_TOKENS = 200 * TOKENS_PER_K;

export type ContextUsageSegmentId =
	| "systemPrompt"
	| "toolDefinitions"
	| "rules"
	| "skills"
	| "mcp"
	| "subagents"
	| "summarizedConversation"
	| "conversation";

export interface ContextUsageSegmentDefinition {
	id: ContextUsageSegmentId;
	label: string;
	color: string;
}

export interface ContextUsageSegment extends ContextUsageSegmentDefinition {
	tokens: number;
	percent: number;
}

export interface ContextUsageSnapshot {
	maxTokens: number;
	usedTokens: number;
	usedPercent: number;
	source: "runtime" | "capacity-only";
	segments: ContextUsageSegment[];
}

export const CONTEXT_USAGE_SEGMENTS: ContextUsageSegmentDefinition[] = [
	{ id: "systemPrompt", label: "System prompt", color: "#a3a3a3" },
	{ id: "toolDefinitions", label: "Tool definitions", color: "#8b5cf6" },
	{ id: "rules", label: "Rules", color: "#42b883" },
	{ id: "skills", label: "Skills", color: "#f6bd60" },
	{ id: "mcp", label: "MCP", color: "#b38bbd" },
	{ id: "subagents", label: "Subagent definitions", color: "#7db4e8" },
	{
		id: "summarizedConversation",
		label: "Summarized conversation",
		color: "#ff5c8a",
	},
	{ id: "conversation", label: "Conversation", color: "#9fb7cf" },
];

function clampTokens(value: number, max = Number.POSITIVE_INFINITY): number {
	if (!Number.isFinite(value) || value < 0) return 0;
	return Math.min(value, max);
}

export function createContextUsageSnapshot({
	maxTokens,
	segments = [],
}: {
	maxTokens: number;
	segments?: Array<{ id: ContextUsageSegmentId; tokens: number }>;
}): ContextUsageSnapshot {
	const normalizedMax = clampTokens(maxTokens);
	const segmentTokens = new Map<ContextUsageSegmentId, number>();
	for (const segment of segments) {
		segmentTokens.set(
			segment.id,
			(segmentTokens.get(segment.id) ?? 0) + clampTokens(segment.tokens),
		);
	}
	const usedTokens = clampTokens(
		Array.from(segmentTokens.values()).reduce((sum, tokens) => sum + tokens, 0),
		normalizedMax,
	);
	const usedPercent =
		normalizedMax > 0 ? (usedTokens / normalizedMax) * 100 : 0;

	return {
		maxTokens: normalizedMax,
		usedTokens,
		usedPercent,
		source: segments.length > 0 ? "runtime" : "capacity-only",
		segments: CONTEXT_USAGE_SEGMENTS.map((definition) => {
			const tokens = segmentTokens.get(definition.id) ?? 0;
			return {
				...definition,
				tokens,
				percent: normalizedMax > 0 ? (tokens / normalizedMax) * 100 : 0,
			};
		}),
	};
}

/**
 * Strip a leading `openai/`, `anthropic/`, … provider prefix and lowercase, so
 * catalog lookups and heuristics work on the bare model id regardless of how
 * the caller spells it.
 */
export function normalizeModelId(modelId: string): string {
	const trimmed = modelId.trim().toLowerCase();
	const slashIndex = trimmed.indexOf("/");
	return slashIndex === -1 ? trimmed : trimmed.slice(slashIndex + 1);
}

/**
 * Canonical capability table keyed by bare model id. Numbers reflect public
 * positioning (context window, modality, tool-use) rather than a private
 * benchmark — they only need to be internally consistent to drive ordering.
 */
const MODEL_CAPABILITY_CATALOG: Record<string, ModelCapabilityMeta> = {
	// Rox house model — strongest, always first.
	r1: {
		capabilities: ["reasoning", "tools", "vision", "longContext"],
		contextWindowTokens: 256 * TOKENS_PER_K,
		strength: 96,
	},
	// Anthropic
	"claude-opus-4-8": {
		capabilities: ["reasoning", "tools", "vision", "longContext"],
		contextWindowTokens: 200 * TOKENS_PER_K,
		strength: 98,
	},
	"claude-opus-4-7": {
		capabilities: ["reasoning", "tools", "vision", "longContext"],
		contextWindowTokens: 200 * TOKENS_PER_K,
		strength: 95,
	},
	"claude-fable-5": {
		capabilities: ["reasoning", "tools", "vision", "longContext"],
		contextWindowTokens: 200 * TOKENS_PER_K,
		strength: 92,
	},
	"claude-sonnet-4-6": {
		capabilities: ["tools", "vision", "longContext"],
		contextWindowTokens: 200 * TOKENS_PER_K,
		strength: 88,
	},
	"claude-haiku-4-5": {
		capabilities: ["tools", "vision", "longContext"],
		contextWindowTokens: 200 * TOKENS_PER_K,
		strength: 74,
	},
	// OpenAI
	"gpt-5.5": {
		capabilities: ["reasoning", "tools", "vision", "longContext"],
		contextWindowTokens: 400 * TOKENS_PER_K,
		strength: 97,
	},
	"gpt-5.4": {
		capabilities: ["reasoning", "tools", "vision", "longContext"],
		contextWindowTokens: 400 * TOKENS_PER_K,
		strength: 94,
	},
	"gpt-5.3-codex": {
		capabilities: ["reasoning", "tools", "longContext"],
		contextWindowTokens: 400 * TOKENS_PER_K,
		strength: 90,
	},
	// Groq
	"llama-3.3-70b-versatile": {
		capabilities: ["tools"],
		contextWindowTokens: 128 * TOKENS_PER_K,
		strength: 70,
	},
	// Google
	"gemini-2.5-pro": {
		capabilities: ["reasoning", "tools", "vision", "video", "longContext"],
		contextWindowTokens: 1000 * TOKENS_PER_K,
		strength: 93,
	},
	"gemini-2.5-flash": {
		capabilities: ["tools", "vision", "video", "longContext"],
		contextWindowTokens: 1000 * TOKENS_PER_K,
		strength: 80,
	},
	// DeepSeek
	"deepseek-chat": {
		capabilities: ["tools", "longContext"],
		contextWindowTokens: 128 * TOKENS_PER_K,
		strength: 76,
	},
	"deepseek-reasoner": {
		capabilities: ["reasoning", "tools", "longContext"],
		contextWindowTokens: 128 * TOKENS_PER_K,
		strength: 82,
	},
};

const HEURISTIC_BASE_STRENGTH = 60;
const HEURISTIC_DEFAULT_CONTEXT_TOKENS = 128 * TOKENS_PER_K;

/**
 * Best-effort capability inference for ids absent from the catalog (e.g. models
 * discovered from a user's custom endpoint). Uses common naming conventions so
 * a "…-vision" or "…-reasoner" still lights up the right badge.
 */
function inferCapabilityMeta(modelId: string): ModelCapabilityMeta {
	const id = normalizeModelId(modelId);
	const capabilities: ModelCapability[] = [];

	const mentions = (...needles: string[]): boolean =>
		needles.some((needle) => id.includes(needle));

	if (mentions("reason", "thinking", "-o1", "-o3", "-o4", "r1")) {
		capabilities.push("reasoning");
	}
	// Most modern chat models are tool-capable; assume so unless clearly a
	// base/instruct-only or embedding model.
	if (!mentions("embed", "whisper", "tts", "moderation")) {
		capabilities.push("tools");
	}
	if (
		mentions("vision", "vl", "multimodal", "omni", "-4o", "gpt-5", "gemini")
	) {
		capabilities.push("vision");
	}
	if (mentions("video", "veo")) {
		capabilities.push("video");
	}
	if (mentions("image", "dall", "imagen", "flux")) {
		capabilities.push("imageGen");
	}

	let contextWindowTokens = HEURISTIC_DEFAULT_CONTEXT_TOKENS;
	if (mentions("1m", "gemini")) contextWindowTokens = 1000 * TOKENS_PER_K;
	else if (mentions("gpt-5")) contextWindowTokens = 400 * TOKENS_PER_K;
	else if (mentions("200k", "claude")) contextWindowTokens = 200 * TOKENS_PER_K;

	if (
		contextWindowTokens >= LONG_CONTEXT_THRESHOLD_TOKENS &&
		!capabilities.includes("longContext")
	) {
		capabilities.push("longContext");
	}

	return {
		capabilities,
		contextWindowTokens,
		strength: HEURISTIC_BASE_STRENGTH,
	};
}

/** Resolve capability metadata for a model id (catalog first, then heuristic). */
export function getModelCapabilityMeta(modelId: string): ModelCapabilityMeta {
	const normalized = normalizeModelId(modelId);
	return MODEL_CAPABILITY_CATALOG[normalized] ?? inferCapabilityMeta(modelId);
}

/** A model option enriched with picker display + ranking metadata. */
export interface EnrichedModelOption extends ModelOption {
	capabilities: ModelCapability[];
	contextWindowTokens: number;
	strength: number;
}

export function enrichModelOption(model: ModelOption): EnrichedModelOption {
	const meta = getModelCapabilityMeta(model.id);
	return { ...model, ...meta };
}

/**
 * Format a context window for display, e.g. `256K` or `1M`. Returns null below
 * 1K so we don't render a noisy "0K" for models with unknown windows.
 */
export function formatContextWindow(tokens: number): string | null {
	if (!Number.isFinite(tokens) || tokens < TOKENS_PER_K) return null;
	const millions = tokens / (1000 * TOKENS_PER_K);
	if (millions >= 1) {
		return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
	}
	return `${Math.round(tokens / TOKENS_PER_K)}K`;
}

export function formatTokenCount(tokens: number): string {
	if (!Number.isFinite(tokens) || tokens <= 0) return "0";
	if (tokens >= 1000 * TOKENS_PER_K) {
		const millions = tokens / (1000 * TOKENS_PER_K);
		return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1)}M`;
	}
	if (tokens >= TOKENS_PER_K) {
		const thousands = tokens / TOKENS_PER_K;
		return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}K`;
	}
	return `${Math.round(tokens)}`;
}

/**
 * Rank enriched models best-first: higher strength wins, ties broken by larger
 * context window, then by name for stable ordering. Pure; does not mutate input.
 */
export function rankEnrichedModels(
	models: EnrichedModelOption[],
): EnrichedModelOption[] {
	return [...models].sort((a, b) => {
		if (b.strength !== a.strength) return b.strength - a.strength;
		if (b.contextWindowTokens !== a.contextWindowTokens) {
			return b.contextWindowTokens - a.contextWindowTokens;
		}
		return a.name.localeCompare(b.name);
	});
}
