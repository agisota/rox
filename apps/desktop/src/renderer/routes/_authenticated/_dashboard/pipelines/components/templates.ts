/**
 * Pipeline + role starter templates for the "pick from template" flows and the
 * canvas templates gallery.
 *
 * Pure, client-safe data: a pipeline template is a ready-made `RoxWorkflowState`
 * graph, and a role template is an {@link AgentRolePreset} bundle. The role
 * templates mirror the built-in roles seeded server-side
 * (`agentRole.seedBuiltins`). The pipeline templates span the data-driven node
 * catalog (AI / Logic / Data / Tools / Output) so the gallery demonstrates the
 * full builder — every template parses to a graph the registry-driven validator
 * accepts (required config provided, required input ports wired).
 */

import type { AgentRolePreset, RoxWorkflowState } from "@rox/workflow-core";

export type PipelineTemplate = {
	id: string;
	name: string;
	/** Short RU description shown in the template picker / gallery. */
	description: string;
	/** Suggested kebab-case slug seed. */
	slugSeed: string;
	/** Gallery grouping label (RU). Optional — ungrouped templates list last. */
	category?: string;
	/** Registry icon name for the gallery card. */
	icon?: string;
	/** Searchable keywords for the gallery filter. */
	tags?: string[];
	build: () => RoxWorkflowState;
};

export type RoleTemplate = {
	slug: string;
	name: string;
	description: string;
	preset: AgentRolePreset;
};

const DEFAULT_CHAT_AGENT = "rox";

// ---------------------------------------------------------------------------
// Role templates (mirror the built-in roles)
// ---------------------------------------------------------------------------

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
	{
		slug: "prompt-improver",
		name: "Промпт-инженер",
		description: "Уточняет и обогащает исходный запрос перед декомпозицией.",
		preset: {
			agentKind: "chat",
			agentId: DEFAULT_CHAT_AGENT,
			systemPrompt:
				"Ты — промпт-инженер. Переформулируй запрос пользователя в чёткое ТЗ: цель, границы, критерий готовности. Не выполняй задачу — только улучшай постановку.",
			skillSlugs: [],
			settings: { maxTurns: 4 },
		},
	},
	{
		slug: "decomposer",
		name: "Декомпозитор",
		description: "Разбивает задачу на независимые подзадачи с критериями.",
		preset: {
			agentKind: "chat",
			agentId: DEFAULT_CHAT_AGENT,
			systemPrompt:
				"Ты — декомпозитор. Разбей ТЗ на 3–7 независимых подзадач. Для каждой: цель, артефакт, критерий готовности. Верни нумерованный список.",
			skillSlugs: [],
			settings: { maxTurns: 4 },
		},
	},
	{
		slug: "orchestrator",
		name: "Оркестратор",
		description: "Координирует выполнение подзадач и сводит результаты.",
		preset: {
			agentKind: "chat",
			agentId: DEFAULT_CHAT_AGENT,
			systemPrompt:
				"Ты — оркестратор. На основе декомпозиции спланируй порядок выполнения, отметь зависимости и собери результаты подзадач в единый итог.",
			skillSlugs: [],
			settings: { maxTurns: 8 },
		},
	},
	{
		slug: "critic",
		name: "Критик",
		description: "Адверсариально проверяет результат и ищет пробелы.",
		preset: {
			agentKind: "chat",
			agentId: DEFAULT_CHAT_AGENT,
			systemPrompt:
				"Ты — критик. Проверь результат адверсариально: найди ошибки, пропущенные требования и риски. Дай конкретный список замечаний и вердикт.",
			skillSlugs: [],
			settings: { maxTurns: 4 },
		},
	},
] as const;

// ---------------------------------------------------------------------------
// Block helpers (typed, position-aware)
// ---------------------------------------------------------------------------

type Pos = { x: number; y: number };
type Block = RoxWorkflowState["blocks"][string];
type Edge = RoxWorkflowState["edges"][number];

function block(
	type: string,
	name: string,
	position: Pos,
	subBlocks?: Record<string, unknown>,
): Block {
	return { type, name, position, subBlocks };
}

function agentBlock(name: string, roleSlug: string, position: Pos): Block {
	return block("agent_run", name, position, { roleSlug });
}

/** Edge with an optional source branch handle (true/false/allowed/…). */
function edge(
	id: string,
	source: string,
	target: string,
	sourceHandle?: string,
): Edge {
	return sourceHandle
		? { id, source, target, sourceHandle }
		: { id, source, target };
}

function workflow(
	name: string,
	blocks: Record<string, Block>,
	edges: Edge[],
): RoxWorkflowState {
	return {
		blocks,
		edges,
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name },
	};
}

// ---------------------------------------------------------------------------
// Template builders
// ---------------------------------------------------------------------------

/** A single start node — the empty canvas template. */
function buildBlank(): RoxWorkflowState {
	return workflow(
		"Пустой пайплайн",
		{ start: block("start", "Старт", { x: 120, y: 220 }) },
		[],
	);
}

/** A linear refine → decompose → orchestrate → critic chain (agent roles). */
function buildRefineDecomposeChain(): RoxWorkflowState {
	return workflow(
		"Уточнение → декомпозиция",
		{
			start: block("start", "Старт", { x: 80, y: 240 }),
			improve: agentBlock("Промпт-инженер", "prompt-improver", {
				x: 340,
				y: 240,
			}),
			decompose: agentBlock("Декомпозитор", "decomposer", { x: 600, y: 240 }),
			orchestrate: agentBlock("Оркестратор", "orchestrator", {
				x: 860,
				y: 240,
			}),
			critic: agentBlock("Критик", "critic", { x: 1120, y: 240 }),
		},
		[
			edge("e1", "start", "improve"),
			edge("e2", "improve", "decompose"),
			edge("e3", "decompose", "orchestrate"),
			edge("e4", "orchestrate", "critic"),
		],
	);
}

/** Orchestrator → critic with a human approval gate before finishing. */
function buildReviewWithApproval(): RoxWorkflowState {
	return workflow(
		"Ревью с подтверждением",
		{
			start: block("start", "Старт", { x: 80, y: 240 }),
			orchestrate: agentBlock("Оркестратор", "orchestrator", {
				x: 340,
				y: 240,
			}),
			critic: agentBlock("Критик", "critic", { x: 600, y: 240 }),
			approval: block(
				"human_approval",
				"Подтверждение",
				{ x: 860, y: 240 },
				{
					approvalMessage: "Подтвердите итог перед выпуском.",
				},
			),
			done: block("response", "Готово", { x: 1120, y: 240 }),
		},
		[
			edge("e1", "start", "orchestrate"),
			edge("e2", "orchestrate", "critic"),
			edge("e3", "critic", "approval"),
			edge("e4", "approval", "done", "approved"),
		],
	);
}

/** RAG bot: retrieve from a knowledge base, answer with an LLM, respond. */
function buildRagBot(): RoxWorkflowState {
	return workflow(
		"RAG-бот",
		{
			start: block("start", "Старт", { x: 80, y: 240 }),
			retrieve: block(
				"knowledge_retrieval",
				"Поиск в базе",
				{ x: 340, y: 240 },
				{ knowledgeBase: "docs", query: "{{input}}", topK: 5 },
			),
			answer: block(
				"model",
				"Ответ LLM",
				{ x: 600, y: 240 },
				{
					model: "gpt-4o",
					systemPrompt:
						"Отвечай только по предоставленному контексту. Если ответа нет — так и скажи.",
					userPrompt: "Контекст: {{retrieve.out}}\n\nВопрос: {{input}}",
					temperature: 0.2,
				},
			),
			done: block("response", "Ответ", { x: 860, y: 240 }),
		},
		[
			edge("e1", "start", "retrieve"),
			edge("e2", "retrieve", "answer"),
			edge("e3", "answer", "done"),
		],
	);
}

/** Tool-using agent: model decides → tool call → model summarises → respond. */
function buildToolUsingAgent(): RoxWorkflowState {
	return workflow(
		"Агент с инструментом",
		{
			start: block("start", "Старт", { x: 80, y: 240 }),
			plan: block(
				"model",
				"Планировщик",
				{ x: 320, y: 240 },
				{
					model: "gpt-4o",
					userPrompt: "Реши, какой инструмент вызвать для запроса: {{input}}",
				},
			),
			tool: block(
				"tool_call",
				"Вызов инструмента",
				{ x: 560, y: 240 },
				{ tool: "search", arguments: { q: "{{input}}" } },
			),
			summarise: block(
				"model",
				"Сводка",
				{ x: 800, y: 240 },
				{
					model: "gpt-4o",
					userPrompt: "Сформулируй ответ из результата: {{tool.out}}",
				},
			),
			done: block("response", "Ответ", { x: 1040, y: 240 }),
		},
		[
			edge("e1", "start", "plan"),
			edge("e2", "plan", "tool"),
			edge("e3", "tool", "summarise"),
			edge("e4", "summarise", "done"),
		],
	);
}

/** Classifier-router: classify intent, switch routes to per-class agents. */
function buildClassifierRouter(): RoxWorkflowState {
	return workflow(
		"Классификатор-роутер",
		{
			start: block("start", "Старт", { x: 80, y: 280 }),
			classify: block(
				"classifier",
				"Классификатор",
				{ x: 320, y: 280 },
				{
					model: "gpt-4o-mini",
					input: "{{input}}",
					classes: {
						sales: "Вопросы про покупку и цены",
						support: "Технические проблемы",
						other: "Прочее",
					},
				},
			),
			route: block(
				"switch",
				"Маршрут",
				{ x: 560, y: 280 },
				{
					value: "{{classify.out}}",
					cases: { sales: "sales", support: "support" },
				},
			),
			sales: agentBlock("Продажи", "orchestrator", { x: 820, y: 140 }),
			support: agentBlock("Поддержка", "critic", { x: 820, y: 300 }),
			fallback: block("response", "Прочее", { x: 820, y: 460 }),
			done: block("response", "Готово", { x: 1080, y: 220 }),
		},
		[
			edge("e1", "start", "classify"),
			edge("e2", "classify", "route"),
			edge("e3", "route", "sales", "case1"),
			edge("e4", "route", "support", "case2"),
			edge("e5", "route", "fallback", "default"),
			edge("e6", "sales", "done"),
			edge("e7", "support", "done"),
		],
	);
}

/** Condition-branch demo: a single if/else routing to two outcomes. */
function buildConditionBranch(): RoxWorkflowState {
	return workflow(
		"Демо ветвления",
		{
			start: block("start", "Старт", { x: 80, y: 260 }),
			score: block(
				"model",
				"Оценка",
				{ x: 320, y: 260 },
				{
					model: "gpt-4o-mini",
					userPrompt: "Оцени запрос от 0 до 1: {{input}}",
				},
			),
			check: block(
				"condition",
				"Порог 0.8",
				{ x: 560, y: 260 },
				{ expression: "score.out > 0.8" },
			),
			pass: block("response", "Принято", { x: 820, y: 160 }),
			fail: block("response", "Отклонено", { x: 820, y: 360 }),
		},
		[
			edge("e1", "start", "score"),
			edge("e2", "score", "check"),
			edge("e3", "check", "pass", "true"),
			edge("e4", "check", "fail", "false"),
		],
	);
}

/** ETL: webhook → HTTP fetch → transform → DB write. */
function buildEtlPipeline(): RoxWorkflowState {
	return workflow(
		"ETL: HTTP → трансформ → БД",
		{
			start: block("start", "Старт", { x: 80, y: 240 }),
			fetch: block(
				"http_request",
				"HTTP-запрос",
				{ x: 320, y: 240 },
				{ method: "GET", url: "https://api.example.com/records" },
			),
			transform: block(
				"transform",
				"Преобразование",
				{ x: 560, y: 240 },
				{
					mode: "mapping",
					mapping: { id: "item.id", name: "item.title" },
				},
			),
			write: block(
				"db_write",
				"Запись в БД",
				{ x: 800, y: 240 },
				{ target: "records", mapping: { id: "row.id", name: "row.name" } },
			),
			done: block("response", "Готово", { x: 1040, y: 240 }),
		},
		[
			edge("e1", "start", "fetch"),
			edge("e2", "fetch", "transform"),
			edge("e3", "transform", "write"),
			edge("e4", "write", "done"),
		],
	);
}

/** Scheduled digest: schedule trigger → DB query → LLM summary → notify. */
function buildScheduledDigest(): RoxWorkflowState {
	return workflow(
		"Дайджест по расписанию",
		{
			start: block("start", "Старт", { x: 80, y: 240 }),
			schedule: block(
				"schedule",
				"Каждое утро",
				{ x: 320, y: 240 },
				{ kind: "cron", expression: "0 9 * * *" },
			),
			query: block(
				"db_query",
				"Свежие записи",
				{ x: 560, y: 240 },
				{
					connection: "main",
					sql: "select * from events where created_at > now() - interval '1 day'",
				},
			),
			summary: block(
				"model",
				"Сводка дня",
				{ x: 800, y: 240 },
				{
					model: "gpt-4o",
					userPrompt: "Сделай краткий дайджест: {{query.out}}",
				},
			),
			notify: block(
				"notify",
				"Уведомление",
				{ x: 1040, y: 240 },
				{ channel: "slack", message: "{{summary.out}}" },
			),
		},
		[
			edge("e1", "start", "schedule"),
			edge("e2", "schedule", "query"),
			edge("e3", "query", "summary"),
			edge("e4", "summary", "notify"),
		],
	);
}

/** Moderation gate: classify → gate → (allowed) respond / (blocked) notify. */
function buildModerationGate(): RoxWorkflowState {
	return workflow(
		"Гейт модерации",
		{
			start: block("start", "Старт", { x: 80, y: 260 }),
			gate: block(
				"gate",
				"Проверка политики",
				{ x: 320, y: 260 },
				{ condition: "input.safe === true" },
			),
			answer: block(
				"model",
				"Ответ",
				{ x: 580, y: 160 },
				{ model: "gpt-4o", userPrompt: "Ответь на: {{input}}" },
			),
			blocked: block(
				"notify",
				"Заблокировано",
				{ x: 580, y: 380 },
				{ channel: "in_app", message: "Запрос отклонён модерацией." },
			),
			done: block("response", "Готово", { x: 840, y: 160 }),
		},
		[
			edge("e1", "start", "gate"),
			edge("e2", "gate", "answer", "allowed"),
			edge("e3", "gate", "blocked", "blocked"),
			edge("e4", "answer", "done"),
		],
	);
}

/** Parallel fan-out + merge: two agents run, a merge node joins, then respond. */
function buildParallelMerge(): RoxWorkflowState {
	return workflow(
		"Параллельно + слияние",
		{
			start: block("start", "Старт", { x: 80, y: 260 }),
			a: agentBlock("Аналитик A", "orchestrator", { x: 340, y: 160 }),
			b: agentBlock("Аналитик B", "critic", { x: 340, y: 360 }),
			merge: block(
				"merge",
				"Слияние",
				{ x: 620, y: 260 },
				{
					mode: "wait_all",
				},
			),
			synth: block(
				"model",
				"Синтез",
				{ x: 860, y: 260 },
				{ model: "gpt-4o", userPrompt: "Сведи два ответа: {{merge.out}}" },
			),
			done: block("response", "Готово", { x: 1100, y: 260 }),
		},
		[
			edge("e1", "start", "a"),
			edge("e2", "start", "b"),
			edge("e3", "a", "merge"),
			edge("e4", "b", "merge"),
			edge("e5", "merge", "synth"),
			edge("e6", "synth", "done"),
		],
	);
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const PIPELINE_TEMPLATES: readonly PipelineTemplate[] = [
	{
		id: "blank",
		name: "Пустой",
		description: "Чистый холст с одним узлом старта.",
		slugSeed: "pipeline",
		category: "Базовые",
		icon: "Play",
		tags: ["пусто", "blank", "старт"],
		build: buildBlank,
	},
	{
		id: "refine-decompose",
		name: "Уточнение → декомпозиция",
		description:
			"Промпт-инженер → декомпозитор → оркестратор → критик. Линейная цепочка.",
		slugSeed: "refine-decompose",
		category: "Агенты",
		icon: "Bot",
		tags: ["агенты", "декомпозиция", "цепочка"],
		build: buildRefineDecomposeChain,
	},
	{
		id: "review-approval",
		name: "Ревью с подтверждением",
		description:
			"Оркестратор → критик → ручное подтверждение → ответ. Гейт перед финалом.",
		slugSeed: "review-approval",
		category: "Агенты",
		icon: "ShieldCheck",
		tags: ["ревью", "подтверждение", "гейт"],
		build: buildReviewWithApproval,
	},
	{
		id: "rag-bot",
		name: "RAG-бот",
		description: "Поиск в базе знаний → ответ LLM по контексту → ответ.",
		slugSeed: "rag-bot",
		category: "ИИ",
		icon: "BookOpen",
		tags: ["rag", "знания", "поиск", "llm"],
		build: buildRagBot,
	},
	{
		id: "tool-agent",
		name: "Агент с инструментом",
		description: "Планировщик → вызов инструмента → сводка результата → ответ.",
		slugSeed: "tool-agent",
		category: "ИИ",
		icon: "Wrench",
		tags: ["инструмент", "tool", "агент"],
		build: buildToolUsingAgent,
	},
	{
		id: "classifier-router",
		name: "Классификатор-роутер",
		description:
			"Классификатор намерения → переключатель → ветки по классам → ответ.",
		slugSeed: "classifier-router",
		category: "ИИ",
		icon: "Tags",
		tags: ["классификатор", "роутер", "switch", "ветвление"],
		build: buildClassifierRouter,
	},
	{
		id: "condition-branch",
		name: "Демо ветвления",
		description: "Оценка → условие (порог) → две ветки исхода. Показ if/else.",
		slugSeed: "condition-branch",
		category: "Логика",
		icon: "GitFork",
		tags: ["условие", "if", "ветвление", "branch"],
		build: buildConditionBranch,
	},
	{
		id: "moderation-gate",
		name: "Гейт модерации",
		description:
			"Гейт политики → пропущено: ответ / заблокировано: уведомление.",
		slugSeed: "moderation-gate",
		category: "Логика",
		icon: "ShieldHalf",
		tags: ["модерация", "гейт", "политика"],
		build: buildModerationGate,
	},
	{
		id: "parallel-merge",
		name: "Параллельно + слияние",
		description:
			"Два агента параллельно → слияние результатов → синтез → ответ.",
		slugSeed: "parallel-merge",
		category: "Логика",
		icon: "GitMerge",
		tags: ["параллельно", "merge", "слияние"],
		build: buildParallelMerge,
	},
	{
		id: "etl-http-db",
		name: "ETL: HTTP → трансформ → БД",
		description: "HTTP-запрос → преобразование полей → запись в БД → готово.",
		slugSeed: "etl-http-db",
		category: "Данные",
		icon: "Database",
		tags: ["etl", "http", "база", "трансформ"],
		build: buildEtlPipeline,
	},
	{
		id: "scheduled-digest",
		name: "Дайджест по расписанию",
		description: "Расписание → запрос в БД → сводка LLM → уведомление в Slack.",
		slugSeed: "scheduled-digest",
		category: "Данные",
		icon: "Clock",
		tags: ["расписание", "дайджест", "cron", "уведомление"],
		build: buildScheduledDigest,
	},
] as const;
