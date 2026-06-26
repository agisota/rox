/**
 * F57 (#650) — context-aware starter-prompt seeding.
 *
 * Pure, DB-free core for the suggestions endpoint: given the active surface and
 * a little workspace/persona context (F21/F25), return 3–4 starter prompts the
 * shared `EmptyState` primitive renders as action chips. Keeping the generation
 * pure means the same logic backs web/desktop/mobile and is unit-testable
 * without a live database.
 */

/** Surfaces that can ask for seeded starters. */
export const EMPTY_STATE_SURFACES = ["chat", "drive", "tab"] as const;
export type EmptyStateSurface = (typeof EMPTY_STATE_SURFACES)[number];

/** A single seeded starter prompt. `id` is stable for the surface+slot. */
export interface StarterPrompt {
	id: string;
	/** Chip label shown to the user. */
	label: string;
	/**
	 * The text the chip dispatches into the composer / ⌘K when clicked. For
	 * action chips (drive/tab) this mirrors the label; chat chips expand into a
	 * full prompt.
	 */
	prompt: string;
}

/** Context the caller resolves from the active workspace/persona (F21/F25). */
export interface SuggestionContext {
	surface: EmptyStateSurface;
	/** Active persona display name, if any (e.g. "Researcher"). */
	personaName?: string | null;
	/** Active workspace name, if any (e.g. "rox-web"). */
	workspaceName?: string | null;
}

/** How many starters each surface returns (issue: 3–4). */
const STARTER_COUNT = 4;

/**
 * Build the seeded starters for a surface. Persona/workspace names tint the
 * copy when present, otherwise generic-but-useful starters are returned so an
 * empty state is never blank.
 */
export function buildStarterPrompts(ctx: SuggestionContext): StarterPrompt[] {
	const persona = ctx.personaName?.trim() || null;
	const workspace = ctx.workspaceName?.trim() || null;

	const starters =
		ctx.surface === "chat"
			? chatStarters(persona, workspace)
			: ctx.surface === "drive"
				? driveStarters(workspace)
				: tabStarters(workspace);

	return starters.slice(0, STARTER_COUNT);
}

function chatStarters(
	persona: string | null,
	workspace: string | null,
): StarterPrompt[] {
	const scope = workspace ? ` в «${workspace}»` : "";
	const lead = persona ? `Спросить ${persona}` : "Начать разговор";
	return [
		{
			id: "chat-summarize",
			label: `${lead}: что нового${scope}`,
			prompt: workspace
				? `Кратко расскажи, что изменилось в проекте «${workspace}» за последнее время.`
				: "Кратко расскажи, над чем мы остановились.",
		},
		{
			id: "chat-plan",
			label: "Составить план",
			prompt: "Помоги составить план для следующей задачи: ",
		},
		{
			id: "chat-explain",
			label: "Объяснить код",
			prompt: "Объясни, как работает этот код, и где узкие места.",
		},
		{
			id: "chat-draft",
			label: "Черновик письма",
			prompt: "Напиши черновик короткого письма о ",
		},
	];
}

function driveStarters(workspace: string | null): StarterPrompt[] {
	const scope = workspace ? ` «${workspace}»` : "";
	return [
		{
			id: "drive-upload",
			label: "Загрузить файлы",
			prompt: "upload",
		},
		{
			id: "drive-folder",
			label: "Создать папку",
			prompt: "create-folder",
		},
		{
			id: "drive-organize",
			label: `Навести порядок${scope}`,
			prompt: "Предложи структуру папок для этого пространства.",
		},
	];
}

function tabStarters(workspace: string | null): StarterPrompt[] {
	const scope = workspace ? ` в «${workspace}»` : "";
	return [
		{
			id: "tab-chat",
			label: "Открыть чат",
			prompt: "new-chat",
		},
		{
			id: "tab-terminal",
			label: "Открыть терминал",
			prompt: "new-terminal",
		},
		{
			id: "tab-browser",
			label: "Открыть браузер",
			prompt: "new-browser",
		},
		{
			id: "tab-search",
			label: `Найти файлы${scope}`,
			prompt: "quick-open",
		},
	];
}
