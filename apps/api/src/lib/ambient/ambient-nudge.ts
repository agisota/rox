/**
 * Ambient agent — pure prompt + transforms (ambient-intelligence epic, phase 4b).
 *
 * The "Act" capstone of the ambient loop. Where phase 1 injected memories INTO a
 * chat run and phase 2 learned memories FROM a session, this path proactively
 * surfaces at most ONE short, genuinely-useful "nudge" per trigger into the
 * journal "Лента" — built from the user's approved memories + recent journal
 * events, with an optional persona.
 *
 * Deliberately free of any `@rox/db/client` import so it can be unit-tested
 * without a database connection. The db-dependent orchestration (find enabled
 * users → rate-limit gate → generate → write journal_event) lives in
 * `ambient-generation.ts`.
 *
 * Scope guardrails (per the phase-4b spec): this is a bounded v1. It does NOT
 * watch the screen, does NOT always-listen, and emits ≤1 nudge per run with a
 * global per-user hourly cap, so cost stays controlled. The model is explicitly
 * allowed — and instructed — to return an EMPTY nudge when there is nothing
 * worth saying, and we suppress low-value/empty replies as a true no-op.
 */

/**
 * Approved-memory categories, mirrored from `@rox/db` so this module stays
 * DB-free. Matches the phase-1 memory-context category set.
 */
export type AmbientMemoryCategory =
	| "projects"
	| "identity"
	| "instructions"
	| "career"
	| "general";

/** Minimal shape the prompt builder needs from a `memory_items` row. */
export interface AmbientMemoryItem {
	category: AmbientMemoryCategory;
	body: string;
}

/** Minimal shape the prompt builder needs from a recent `journal_events` row. */
export interface AmbientJournalEvent {
	title: string;
	summary: string | null;
	createdAt: Date | string;
}

/** A single proactive nudge produced for one user. */
export interface AmbientNudge {
	title: string;
	body: string;
}

// ── Cost caps (hard ceilings; mirror the session-learn budgets) ──────────────

/**
 * Global per-user rate limit: at most this many ambient nudges in the trailing
 * hour. The reconcile counts recent `ambient_nudge` journal_events for the user
 * and skips when the cap is hit, so a chatty trigger can't run up cost.
 */
export const MAX_NUDGES_PER_HOUR = 3;

/** Trailing window the hourly rate limit is measured over. */
export const NUDGE_RATE_WINDOW_MS = 60 * 60 * 1000;

/** Max approved memories fed to the model, to bound context cost. */
export const MAX_MEMORY_ITEMS = 25;

/** Soft character budget for the rendered memory bodies, to bound context cost. */
export const MAX_MEMORY_CHARS = 4_000;

/** Max recent journal events fed to the model, to bound context cost. */
export const MAX_EVENTS = 20;

/** Hard character ceiling for the whole recent-events context block. */
export const MAX_EVENTS_CHARS = 3_000;

/** Hard character ceiling for the persona, so a runaway persona can't bloat cost. */
export const MAX_PERSONA_CHARS = 1_000;

/** Nudge title length ceiling (a headline, not a paragraph). */
export const MAX_NUDGE_TITLE_CHARS = 80;

/** Nudge body length ceiling (one short, useful suggestion). */
export const MAX_NUDGE_BODY_CHARS = 400;

/**
 * Categories surfaced first regardless of order: how-to-work-with-me and
 * who-the-user-is matter most for a useful nudge. Mirrors phase-1's priority.
 */
const PRIORITY_CATEGORIES: ReadonlySet<AmbientMemoryCategory> = new Set([
	"instructions",
	"identity",
]);

/** RU category headers — identical to the phase-1 memory-context block. */
const CATEGORY_HEADERS: Record<AmbientMemoryCategory, string> = {
	projects: "Проекты",
	identity: "Личное",
	instructions: "Предпочтения и правила",
	career: "Карьера и история",
	general: "Общие правила и принципы",
};

/** Fixed display order of category groups in the rendered memory block. */
const CATEGORY_ORDER: readonly AmbientMemoryCategory[] = [
	"instructions",
	"identity",
	"projects",
	"career",
	"general",
];

export const AMBIENT_NUDGE_SYSTEM_PROMPT = `Ты — проактивный ассистент Rox. Ты работаешь в фоне и ИЗРЕДКА, только когда это действительно полезно, отправляешь пользователю ОДНУ короткую подсказку — она появится в его ленте журнала.

Тебе дают: известные факты о пользователе (его память и предпочтения), список последних событий его автоматизаций и, возможно, описание желаемого стиля ассистента. На основе этого реши, есть ли ОДНА по-настоящему ценная проактивная мысль: напоминание, риск, который стоит проверить, очевидный следующий шаг или связка между его проектами и недавними событиями.

Верни СТРОГО JSON-объект без markdown и без текста вне JSON, по схеме:
{ "nudge": { "title": "короткий заголовок", "body": "одно короткое полезное предложение на русском" } }
или, если сказать нечего:
{ "nudge": null }

Правила:
- По умолчанию молчи. Возвращай подсказку ТОЛЬКО если она реально полезна прямо сейчас. Если сомневаешься — верни { "nudge": null }.
- НЕ повторяй то, что пользователь и так знает, не пересказывай события, не добавляй пустую вежливость.
- Максимум ОДНА подсказка. Пиши по-русски, кратко: заголовок — несколько слов, тело — одно предложение.
- Не выдумывай фактов, которых нет во входных данных.
- Верни ТОЛЬКО JSON-объект.`;

function toTime(value: Date | string): number {
	const time = value instanceof Date ? value.getTime() : Date.parse(value);
	return Number.isNaN(time) ? 0 : time;
}

/**
 * Render the approved-memory context block, grouped by category with RU headers.
 * `instructions` + `identity` lead; then cap by item count AND char budget
 * (whichever binds first). Returns "" when there is nothing to render. Mirrors
 * the phase-1 `buildMemoryContextBlock` shape so the nudge model reads the same
 * memory view the chat does.
 */
export function buildMemoryBlock(items: readonly AmbientMemoryItem[]): string {
	const sorted = [...items].sort((a, b) => {
		const aPriority = PRIORITY_CATEGORIES.has(a.category) ? 1 : 0;
		const bPriority = PRIORITY_CATEGORIES.has(b.category) ? 1 : 0;
		return bPriority - aPriority;
	});

	const selected: AmbientMemoryItem[] = [];
	let usedChars = 0;
	for (const item of sorted) {
		if (selected.length >= MAX_MEMORY_ITEMS) break;
		const body = item.body.trim();
		if (!body) continue;
		if (selected.length > 0 && usedChars + body.length > MAX_MEMORY_CHARS) {
			continue;
		}
		selected.push({ category: item.category, body });
		usedChars += body.length;
	}
	if (selected.length === 0) return "";

	const grouped = new Map<AmbientMemoryCategory, string[]>();
	for (const item of selected) {
		const bucket = grouped.get(item.category);
		if (bucket) bucket.push(item.body);
		else grouped.set(item.category, [item.body]);
	}

	const sections: string[] = [];
	for (const category of CATEGORY_ORDER) {
		const bodies = grouped.get(category);
		if (!bodies || bodies.length === 0) continue;
		const lines = bodies.map((body) => `- ${body}`).join("\n");
		sections.push(`## ${CATEGORY_HEADERS[category]}\n${lines}`);
	}
	return sections.join("\n\n");
}

/**
 * Render recent journal events as a compact, newest-first list, capped by count
 * and a hard char ceiling. Returns "" when there are no events.
 */
export function buildEventsBlock(
	events: readonly AmbientJournalEvent[],
): string {
	const sorted = [...events]
		.sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
		.slice(0, MAX_EVENTS);

	const lines: string[] = [];
	let usedChars = 0;
	for (const event of sorted) {
		const title = event.title.trim();
		if (!title) continue;
		const summary = event.summary?.trim();
		const line = summary ? `- ${title} — ${summary}` : `- ${title}`;
		if (lines.length > 0 && usedChars + line.length > MAX_EVENTS_CHARS) break;
		lines.push(line);
		usedChars += line.length;
	}
	return lines.join("\n");
}

/**
 * Assemble the user-message context for the nudge model from the memory block,
 * recent events, and an optional persona. Returns `null` when there is no
 * signal at all (no memories AND no events) — there is nothing to be proactive
 * about, so the caller should skip the model call entirely (a true no-op that
 * also saves cost).
 */
export function buildNudgeContext(args: {
	memories: readonly AmbientMemoryItem[];
	events: readonly AmbientJournalEvent[];
	persona?: string | null;
}): string | null {
	const memoryBlock = buildMemoryBlock(args.memories);
	const eventsBlock = buildEventsBlock(args.events);
	if (!memoryBlock && !eventsBlock) return null;

	const persona = args.persona?.trim().slice(0, MAX_PERSONA_CHARS);

	const parts: string[] = [];
	if (persona) {
		parts.push(`# Желаемый стиль ассистента\n${persona}`);
	}
	parts.push(
		memoryBlock
			? `# Что известно о пользователе\n${memoryBlock}`
			: "# Что известно о пользователе\n(нет сохранённых фактов)",
	);
	parts.push(
		eventsBlock
			? `# Последние события\n${eventsBlock}`
			: "# Последние события\n(нет недавних событий)",
	);
	return parts.join("\n\n");
}

/**
 * Coerce a raw model reply (already JSON-parsed) into a clean {@link AmbientNudge}
 * or `null`. Enforces empty=no-op: returns `null` for a missing/null nudge, an
 * empty title or body, or a non-object. Trims and hard-caps title/body lengths.
 * Mirrors the session-learn/journal sanitizers so behaviour is uniform.
 */
export function sanitizeNudge(nudge: unknown): AmbientNudge | null {
	if (typeof nudge !== "object" || nudge === null) return null;
	const title = String((nudge as { title?: unknown }).title ?? "").trim();
	const body = String((nudge as { body?: unknown }).body ?? "").trim();
	if (!title || !body) return null;
	return {
		title: title.slice(0, MAX_NUDGE_TITLE_CHARS),
		body: body.slice(0, MAX_NUDGE_BODY_CHARS),
	};
}
