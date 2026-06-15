export type SessionDashboardSessionRow = {
	id: string;
	title: string | null;
	workspaceId: string | null;
	v2WorkspaceId: string | null;
	createdAt: Date;
	updatedAt: Date;
	lastActiveAt: Date;
};

export type SessionDashboardUsageRow = {
	id: string;
	modelId: string;
	tokensIn: number;
	tokensOut: number;
	trace: Record<string, unknown> | null;
	createdAt: Date;
};

export type SessionActivityKind = "tool" | "result" | "complete" | "request";

export type SessionActivityItem = {
	id: string;
	kind: SessionActivityKind;
	title: string;
	detail: string;
	timestamp: string;
	offsetMs: number;
	toolName: string | null;
	tokensIn: number;
	tokensOut: number;
};

export type SessionTraceMessage = {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
};

export type SessionTraceRequest = {
	id: string;
	model: string;
	timestamp: string;
	durationMs: number;
	inputTokens: number;
	outputTokens: number;
	cacheRead: number;
	cacheWrite: number;
	inputMessages: SessionTraceMessage[];
	toolNames: string[];
	preview: string;
};

export type SessionToolSequenceItem = {
	id: string;
	toolName: string;
	timestamp: string;
	status: "ok" | "error";
};

export type SessionToolLegendItem = {
	toolName: string;
	count: number;
	percent: number;
	colorClassName: string;
};

export type SessionContextPoint = {
	label: string;
	tokens: number;
	percent: number;
};

export type SessionDashboardSummary = {
	id: string;
	title: string;
	href: string;
	model: string;
	startedAt: string;
	lastActiveAt: string;
	totalTokens: number;
	llmCalls: number;
	toolCalls: number;
	contextPercent: number;
	lastMessage: string;
};

export type SessionDashboardDetail = {
	id: string;
	title: string;
	workingDirectory: string;
	resumeCommand: string;
	overview: {
		model: string;
		startedAt: string;
		lastMessageAt: string;
		lastMessage: string;
	};
	stats: {
		totalTokens: number;
		llmCalls: number;
		durationMs: number;
		toolCalls: number;
		turns: number;
	};
	currentContext: {
		usedTokens: number;
		windowTokens: number;
		usedPercent: number;
		peakTokens: number;
		compactions: number;
		trend: SessionContextPoint[];
	};
	tokenUsage: {
		input: number;
		output: number;
		ratio: number;
	};
	cache: {
		hitRate: number;
		reads: number;
		writes: number;
	};
	activity: SessionActivityItem[];
	traceRequests: SessionTraceRequest[];
	toolSequence: {
		items: SessionToolSequenceItem[];
		legend: SessionToolLegendItem[];
	};
};

type NormalizedTrace = {
	workingDirectory: string | null;
	lastMessage: string | null;
	durationMs: number;
	cacheRead: number;
	cacheWrite: number;
	contextTokens: number | null;
	contextWindow: number | null;
	contextCompactions: number;
	contextTrend: number[];
	activity: Omit<SessionActivityItem, "offsetMs">[];
	requests: SessionTraceRequest[];
	toolCalls: Omit<SessionToolSequenceItem, "id">[];
};

const TOOL_COLORS = [
	"bg-emerald-400",
	"bg-sky-400",
	"bg-violet-400",
	"bg-amber-400",
	"bg-rose-400",
	"bg-cyan-300",
	"bg-lime-400",
	"bg-fuchsia-400",
];

export function buildSessionDashboardSummary(
	session: SessionDashboardSessionRow,
	usageRows: SessionDashboardUsageRow[],
): SessionDashboardSummary {
	const detail = buildSessionDashboardDetail(session, usageRows);

	return {
		id: detail.id,
		title: detail.title,
		href: `/agents/sessions/${detail.id}`,
		model: detail.overview.model,
		startedAt: detail.overview.startedAt,
		lastActiveAt: detail.overview.lastMessageAt,
		totalTokens: detail.stats.totalTokens,
		llmCalls: detail.stats.llmCalls,
		toolCalls: detail.stats.toolCalls,
		contextPercent: detail.currentContext.usedPercent,
		lastMessage: detail.overview.lastMessage,
	};
}

export function buildSessionDashboardDetail(
	session: SessionDashboardSessionRow,
	usageRows: SessionDashboardUsageRow[],
): SessionDashboardDetail {
	const rows = [...usageRows].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	);
	const traces = rows.map((row) => normalizeTrace(row));
	const input = sum(rows, (row) => row.tokensIn);
	const output = sum(rows, (row) => row.tokensOut);
	const cacheReads = sum(traces, (trace) => trace.cacheRead);
	const cacheWrites = sum(traces, (trace) => trace.cacheWrite);
	const activity = buildActivity(session, rows, traces);
	const traceRequests = buildTraceRequests(rows, traces);
	const toolItems = buildToolSequenceItems(activity, traces);
	const lastTraceWithMessage = [...traces]
		.reverse()
		.find((trace) => trace.lastMessage);
	const lastUsageAt = rows.at(-1)?.createdAt ?? session.lastActiveAt;
	const currentContext = buildContext(session, rows, traces, input + output);
	const durationMs = Math.max(
		0,
		session.lastActiveAt.getTime() - session.createdAt.getTime(),
		sum(traces, (trace) => trace.durationMs),
	);

	return {
		id: session.id,
		title: session.title?.trim() || "Сессия агента",
		workingDirectory:
			traces.find((trace) => trace.workingDirectory)?.workingDirectory ??
			workspaceLabel(session) ??
			"не указан",
		resumeCommand: `evot --resume ${session.id}`,
		overview: {
			model: rows.at(-1)?.modelId ?? "нет данных",
			startedAt: session.createdAt.toISOString(),
			lastMessageAt: lastUsageAt.toISOString(),
			lastMessage:
				lastTraceWithMessage?.lastMessage ??
				session.title?.trim() ??
				"Сообщения ещё не записаны",
		},
		stats: {
			totalTokens: input + output,
			llmCalls: rows.length,
			durationMs,
			toolCalls: toolItems.length,
			turns: Math.max(rows.length, activity.length),
		},
		currentContext,
		tokenUsage: {
			input,
			output,
			ratio: output === 0 ? input : input / output,
		},
		cache: {
			hitRate:
				cacheReads + input === 0
					? 0
					: roundPercent(cacheReads / (cacheReads + input)),
			reads: cacheReads,
			writes: cacheWrites,
		},
		activity,
		traceRequests,
		toolSequence: {
			items: toolItems,
			legend: buildToolLegend(toolItems),
		},
	};
}

function normalizeTrace(row: SessionDashboardUsageRow): NormalizedTrace {
	const trace = row.trace ?? {};
	const requests = getArray(trace, "requests")
		.map((value, index) =>
			normalizeTraceRequest(value, {
				id: `${row.id}-request-${index + 1}`,
				model: row.modelId,
				timestamp: row.createdAt,
				inputTokens: row.tokensIn,
				outputTokens: row.tokensOut,
			}),
		)
		.filter((request): request is SessionTraceRequest => request !== null);

	return {
		workingDirectory:
			getString(trace, "workingDirectory") ??
			getString(trace, "cwd") ??
			getString(trace, "working_dir"),
		lastMessage:
			getString(trace, "lastMessage") ??
			getString(trace, "last_message") ??
			getString(trace, "summary") ??
			getString(trace, "preview"),
		durationMs:
			getNumber(trace, "durationMs") ??
			getNumber(trace, "duration_ms") ??
			getNumber(trace, "duration") ??
			0,
		cacheRead:
			getNumber(trace, "cacheRead") ??
			getNumber(trace, "cache_read") ??
			getNumber(trace, "cacheReads") ??
			getNumber(getRecord(trace, "cache"), "reads") ??
			getNumber(getRecord(trace, "usage"), "cache_read") ??
			0,
		cacheWrite:
			getNumber(trace, "cacheWrite") ??
			getNumber(trace, "cache_write") ??
			getNumber(trace, "cacheWrites") ??
			getNumber(getRecord(trace, "cache"), "writes") ??
			getNumber(getRecord(trace, "usage"), "cache_write") ??
			0,
		contextTokens:
			getNumber(trace, "contextTokens") ??
			getNumber(trace, "context_tokens") ??
			getNumber(trace, "currentContextTokens") ??
			getNumber(getRecord(trace, "context"), "tokens"),
		contextWindow:
			getNumber(trace, "contextWindow") ??
			getNumber(trace, "context_window") ??
			getNumber(trace, "windowTokens") ??
			getNumber(getRecord(trace, "context"), "window"),
		contextCompactions:
			getNumber(trace, "contextCompactions") ??
			getNumber(trace, "context_compactions") ??
			getNumber(getRecord(trace, "context"), "compactions") ??
			0,
		contextTrend: normalizeContextTrend(trace),
		activity: normalizeActivity(trace, row),
		requests,
		toolCalls: normalizeToolCalls(trace, row),
	};
}

function buildActivity(
	session: SessionDashboardSessionRow,
	rows: SessionDashboardUsageRow[],
	traces: NormalizedTrace[],
): SessionActivityItem[] {
	const selected = rows.flatMap<Omit<SessionActivityItem, "offsetMs">>(
		(row, index) => {
			const traceActivity = traces[index]?.activity ?? [];
			if (traceActivity.length > 0) {
				return traceActivity;
			}

			return [
				{
					id: `${row.id}-activity`,
					kind: "request",
					title: `LLM вызов: ${row.modelId}`,
					detail: `${formatInteger(row.tokensIn)} in / ${formatInteger(row.tokensOut)} out`,
					timestamp: row.createdAt.toISOString(),
					toolName: null,
					tokensIn: row.tokensIn,
					tokensOut: row.tokensOut,
				},
			];
		},
	);

	return selected
		.sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		)
		.map((item, index) => ({
			...item,
			id: item.id || `activity-${index + 1}`,
			offsetMs: Math.max(
				0,
				new Date(item.timestamp).getTime() - session.createdAt.getTime(),
			),
		}));
}

function buildTraceRequests(
	rows: SessionDashboardUsageRow[],
	traces: NormalizedTrace[],
): SessionTraceRequest[] {
	return rows.flatMap((row, index) => {
		const trace = traces[index];
		if (trace?.requests.length) {
			return trace.requests;
		}

		return [
			{
				id: `${row.id}-request`,
				model: row.modelId,
				timestamp: row.createdAt.toISOString(),
				durationMs: trace?.durationMs ?? 0,
				inputTokens: row.tokensIn,
				outputTokens: row.tokensOut,
				cacheRead: trace?.cacheRead ?? 0,
				cacheWrite: trace?.cacheWrite ?? 0,
				inputMessages: [],
				toolNames: [],
				preview: "Запрос записан без детального trace payload",
			},
		];
	});
}

function buildToolSequenceItems(
	activity: SessionActivityItem[],
	traces: NormalizedTrace[],
): SessionToolSequenceItem[] {
	const explicit = traces.flatMap((trace) => trace.toolCalls);
	const items =
		explicit.length > 0
			? explicit
			: activity
					.filter((item) => item.kind === "tool" && item.toolName)
					.map((item) => ({
						toolName: item.toolName ?? "tool",
						timestamp: item.timestamp,
						status: "ok" as const,
					}));

	return items.map((item, index) => ({
		...item,
		id: `tool-${index + 1}-${slugify(item.toolName)}`,
	}));
}

function buildToolLegend(
	items: SessionToolSequenceItem[],
): SessionToolLegendItem[] {
	const counts = new Map<string, number>();
	for (const item of items) {
		counts.set(item.toolName, (counts.get(item.toolName) ?? 0) + 1);
	}

	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([toolName, count], index) => ({
			toolName,
			count,
			percent: items.length === 0 ? 0 : roundPercent(count / items.length),
			colorClassName:
				TOOL_COLORS[index % TOOL_COLORS.length] ?? "bg-emerald-400",
		}));
}

function buildContext(
	session: SessionDashboardSessionRow,
	rows: SessionDashboardUsageRow[],
	traces: NormalizedTrace[],
	totalTokens: number,
): SessionDashboardDetail["currentContext"] {
	const observedContexts = traces
		.map((trace) => trace.contextTokens)
		.filter((value): value is number => typeof value === "number");
	const usedTokens = observedContexts.at(-1) ?? totalTokens;
	const peakTokens = Math.max(usedTokens, ...observedContexts, 0);
	const windowTokens = Math.max(
		...traces
			.map((trace) => trace.contextWindow)
			.filter((value): value is number => typeof value === "number"),
		peakTokens,
		1,
	);
	const explicitTrend = traces.flatMap((trace) => trace.contextTrend);
	const trendTokens =
		explicitTrend.length > 0 ? explicitTrend : cumulativeTokenTrend(rows);

	return {
		usedTokens,
		windowTokens,
		usedPercent: roundPercent(usedTokens / windowTokens),
		peakTokens,
		compactions: sum(traces, (trace) => trace.contextCompactions),
		trend: trendTokens.map((tokens, index) => ({
			label:
				rows[index]?.createdAt.toISOString() ??
				new Date(session.createdAt.getTime() + index).toISOString(),
			tokens,
			percent: roundPercent(tokens / windowTokens),
		})),
	};
}

function normalizeActivity(
	trace: Record<string, unknown>,
	row: SessionDashboardUsageRow,
): Omit<SessionActivityItem, "offsetMs">[] {
	return getArray(trace, "activity")
		.map((value, index) => {
			const record = asRecord(value);
			if (!record) {
				return null;
			}

			const timestamp = normalizeTimestamp(
				getUnknown(record, "timestamp") ?? getUnknown(record, "time"),
				row.createdAt,
			);
			const kind = normalizeActivityKind(
				getString(record, "kind") ?? getString(record, "type"),
			);
			const toolName =
				getString(record, "toolName") ??
				getString(record, "tool_name") ??
				getString(record, "name");

			return {
				id: getString(record, "id") ?? `${row.id}-trace-activity-${index + 1}`,
				kind,
				title:
					getString(record, "title") ??
					getString(record, "label") ??
					getString(record, "message") ??
					toolName ??
					"Событие trace",
				detail:
					getString(record, "detail") ??
					getString(record, "description") ??
					getString(record, "content") ??
					"",
				timestamp,
				toolName,
				tokensIn: getNumber(record, "tokensIn") ?? row.tokensIn,
				tokensOut: getNumber(record, "tokensOut") ?? row.tokensOut,
			};
		})
		.filter(
			(item): item is Omit<SessionActivityItem, "offsetMs"> => item !== null,
		);
}

function normalizeTraceRequest(
	value: unknown,
	fallback: {
		id: string;
		model: string;
		timestamp: Date;
		inputTokens: number;
		outputTokens: number;
	},
): SessionTraceRequest | null {
	const record = asRecord(value);
	if (!record) {
		return null;
	}

	const messages = normalizeMessages(
		getArray(record, "inputMessages").length > 0
			? getArray(record, "inputMessages")
			: getArray(record, "messages"),
	);
	const toolNames = normalizeToolNames(record);

	return {
		id: getString(record, "id") ?? fallback.id,
		model: getString(record, "model") ?? fallback.model,
		timestamp: normalizeTimestamp(
			getUnknown(record, "timestamp") ?? getUnknown(record, "createdAt"),
			fallback.timestamp,
		),
		durationMs:
			getNumber(record, "durationMs") ?? getNumber(record, "duration_ms") ?? 0,
		inputTokens:
			getNumber(record, "inputTokens") ??
			getNumber(record, "input_tokens") ??
			fallback.inputTokens,
		outputTokens:
			getNumber(record, "outputTokens") ??
			getNumber(record, "output_tokens") ??
			fallback.outputTokens,
		cacheRead:
			getNumber(record, "cacheRead") ?? getNumber(record, "cache_read") ?? 0,
		cacheWrite:
			getNumber(record, "cacheWrite") ?? getNumber(record, "cache_write") ?? 0,
		inputMessages: messages,
		toolNames,
		preview:
			getString(record, "preview") ??
			getString(record, "summary") ??
			messages.at(-1)?.content ??
			"Trace request",
	};
}

function normalizeMessages(values: unknown[]): SessionTraceMessage[] {
	return values
		.map((value) => {
			const record = asRecord(value);
			if (!record) {
				return null;
			}

			const role = normalizeRole(getString(record, "role"));
			const content =
				getString(record, "content") ??
				getString(record, "text") ??
				getString(record, "message");

			if (!role || !content) {
				return null;
			}

			return { role, content };
		})
		.filter((message): message is SessionTraceMessage => message !== null);
}

function normalizeToolNames(record: Record<string, unknown>): string[] {
	const values = getArray(record, "toolNames").length
		? getArray(record, "toolNames")
		: getArray(record, "tools");

	return values
		.map((value) => {
			if (typeof value === "string") {
				return value;
			}
			const tool = asRecord(value);
			return tool
				? (getString(tool, "name") ?? getString(tool, "toolName"))
				: null;
		})
		.filter((name): name is string => Boolean(name));
}

function normalizeToolCalls(
	trace: Record<string, unknown>,
	row: SessionDashboardUsageRow,
): Omit<SessionToolSequenceItem, "id">[] {
	return getArray(trace, "toolCalls")
		.map((value) => {
			const record = asRecord(value);
			if (!record) {
				return null;
			}

			const toolName =
				getString(record, "name") ??
				getString(record, "toolName") ??
				getString(record, "tool_name");

			if (!toolName) {
				return null;
			}

			return {
				toolName,
				timestamp: normalizeTimestamp(
					getUnknown(record, "timestamp"),
					row.createdAt,
				),
				status: getString(record, "status") === "error" ? "error" : "ok",
			} as const;
		})
		.filter(
			(item): item is Omit<SessionToolSequenceItem, "id"> => item !== null,
		);
}

function normalizeContextTrend(trace: Record<string, unknown>): number[] {
	const values = getArray(trace, "contextTrend").length
		? getArray(trace, "contextTrend")
		: getArray(getRecord(trace, "context"), "trend");

	return values
		.map((value) => {
			if (typeof value === "number" && Number.isFinite(value)) {
				return value;
			}
			const record = asRecord(value);
			return record
				? (getNumber(record, "tokens") ??
						getNumber(record, "value") ??
						getNumber(record, "contextTokens"))
				: null;
		})
		.filter((value): value is number => typeof value === "number");
}

function cumulativeTokenTrend(rows: SessionDashboardUsageRow[]): number[] {
	let total = 0;
	return rows.map((row) => {
		total += row.tokensIn + row.tokensOut;
		return total;
	});
}

function workspaceLabel(session: SessionDashboardSessionRow) {
	if (session.v2WorkspaceId) {
		return `workspace:${session.v2WorkspaceId}`;
	}
	if (session.workspaceId) {
		return `workspace:${session.workspaceId}`;
	}
	return null;
}

function normalizeActivityKind(value: string | null): SessionActivityKind {
	if (value === "tool" || value === "result" || value === "complete") {
		return value;
	}
	return "request";
}

function normalizeRole(
	value: string | null,
): SessionTraceMessage["role"] | null {
	if (
		value === "system" ||
		value === "user" ||
		value === "assistant" ||
		value === "tool"
	) {
		return value;
	}
	return null;
}

function normalizeTimestamp(value: unknown, fallback: Date): string {
	if (value instanceof Date && Number.isFinite(value.getTime())) {
		return value.toISOString();
	}
	if (typeof value === "string" || typeof value === "number") {
		const parsed = new Date(value);
		if (Number.isFinite(parsed.getTime())) {
			return parsed.toISOString();
		}
	}
	return fallback.toISOString();
}

function getArray(
	record: Record<string, unknown> | null,
	key: string,
): unknown[] {
	const value = getUnknown(record, key);
	return Array.isArray(value) ? value : [];
}

function getRecord(
	record: Record<string, unknown> | null,
	key: string,
): Record<string, unknown> | null {
	return asRecord(getUnknown(record, key));
}

function getString(record: Record<string, unknown> | null, key: string) {
	const value = getUnknown(record, key);
	return typeof value === "string" && value.trim() ? value : null;
}

function getNumber(record: Record<string, unknown> | null, key: string) {
	const value = getUnknown(record, key);
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function getUnknown(record: Record<string, unknown> | null, key: string) {
	return record ? record[key] : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function sum<T>(items: T[], selector: (item: T) => number) {
	return items.reduce((total, item) => total + selector(item), 0);
}

function roundPercent(value: number) {
	return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function formatInteger(value: number) {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
		value,
	);
}

function slugify(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}
