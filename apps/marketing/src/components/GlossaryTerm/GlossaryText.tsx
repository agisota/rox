"use client";

import { GlossaryTerm } from "./GlossaryTerm";

type GlossaryKind = "term" | "properNoun";

interface GlossaryEntry {
	label: string;
	description: string;
	kind: GlossaryKind;
}

interface GlossaryToken {
	text: string;
	key: string;
	entry?: GlossaryEntry;
}

const GLOSSARY_DEFINITIONS = [
	{
		label: "Claude Code",
		description: "CLI-агент Anthropic для работы с кодом прямо из терминала.",
		kind: "properNoun",
	},
	{
		label: "OpenAI Codex",
		description:
			"Кодовый агент OpenAI для выполнения задач разработки по текстовому заданию.",
		kind: "properNoun",
	},
	{
		label: "OpenCode",
		description:
			"Open-source CLI-инструмент для запуска AI-агентов с разными моделями.",
		kind: "properNoun",
	},
	{
		label: "Cursor",
		description:
			"AI-редактор кода, который можно открывать из Rox для проверки worktree.",
		kind: "properNoun",
	},
	{
		label: "Codex",
		description:
			"Кодовый агент OpenAI для автономной работы над задачами разработки.",
		kind: "properNoun",
	},
	{
		label: "Gemini",
		description:
			"Семейство AI-моделей Google, которые могут использоваться в агентских инструментах.",
		kind: "properNoun",
	},
	{
		label: "VS Code",
		description:
			"Редактор кода Microsoft, который Rox может открыть для выбранной задачи.",
		kind: "properNoun",
	},
	{
		label: "Xcode",
		description:
			"IDE Apple для разработки приложений под macOS, iOS и другие платформы Apple.",
		kind: "properNoun",
	},
	{
		label: "JetBrains",
		description:
			"Семейство профессиональных IDE, включая IntelliJ IDEA, WebStorm и PyCharm.",
		kind: "properNoun",
	},
	{
		label: "git-worktree",
		description:
			"Отдельная рабочая директория одного Git-репозитория: своя ветка и файлы, но общая история.",
		kind: "term",
	},
	{
		label: "Git worktree",
		description:
			"Отдельная рабочая директория одного Git-репозитория: своя ветка и файлы, но общая история.",
		kind: "term",
	},
	{
		label: "git worktree",
		description:
			"Отдельная рабочая директория одного Git-репозитория: своя ветка и файлы, но общая история.",
		kind: "term",
	},
	{
		label: "worktree",
		description:
			"Изолированная рабочая копия репозитория, где задача может менять файлы отдельно от других задач.",
		kind: "term",
	},
	{
		label: "CLI-инструмент",
		description:
			"Инструмент командной строки: запускается из терминала и принимает команды текстом.",
		kind: "term",
	},
	{
		label: "CLI-агентом",
		description:
			"Агент командной строки, который читает задачу, меняет код и запускает проверки в терминале.",
		kind: "term",
	},
	{
		label: "CLI-агентов",
		description:
			"Агенты командной строки, которые запускаются в терминале и работают с кодом локально.",
		kind: "term",
	},
	{
		label: "CLI",
		description:
			"Command Line Interface: интерфейс командной строки для запуска инструментов из терминала.",
		kind: "term",
	},
	{
		label: "MCP",
		description:
			"Model Context Protocol: стандарт подключения моделей к внешним инструментам и данным.",
		kind: "term",
	},
	{
		label: "AI-агентов",
		description:
			"AI-агенты могут самостоятельно читать код, редактировать файлы и запускать команды для задачи.",
		kind: "term",
	},
	{
		label: "ИИ-агентов",
		description:
			"ИИ-агенты могут самостоятельно читать код, редактировать файлы и запускать команды для задачи.",
		kind: "term",
	},
	{
		label: "кодинг-агентов",
		description:
			"Агенты разработки, которые выполняют инженерные задачи в кодовой базе.",
		kind: "term",
	},
	{
		label: "Агент",
		description:
			"Автономный помощник разработки, который получает задачу и работает с кодом в отдельной среде.",
		kind: "term",
	},
	{
		label: "агентами",
		description:
			"Автономные помощники разработки, которые могут параллельно работать над разными задачами.",
		kind: "term",
	},
	{
		label: "агентов",
		description:
			"Автономные помощники разработки, которые могут параллельно работать над разными задачами.",
		kind: "term",
	},
	{
		label: "агенту",
		description:
			"Автономный помощник разработки, который получает задачу и работает с кодом.",
		kind: "term",
	},
	{
		label: "агента",
		description:
			"Автономный помощник разработки, который получает задачу и работает с кодом.",
		kind: "term",
	},
	{
		label: "агент",
		description:
			"Автономный помощник разработки, который получает задачу и работает с кодом.",
		kind: "term",
	},
] satisfies GlossaryEntry[];

const GLOSSARY_ENTRIES = [...GLOSSARY_DEFINITIONS].sort(
	(a, b) => b.label.length - a.label.length,
);

const GLOSSARY_PATTERN = new RegExp(
	`(${GLOSSARY_ENTRIES.map((entry) => escapeRegExp(entry.label)).join("|")})`,
	"g",
);

const GLOSSARY_BY_LABEL = new Map(
	GLOSSARY_ENTRIES.map((entry) => [entry.label, entry]),
);

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeGlossaryText(text: string): GlossaryToken[] {
	const tokens: GlossaryToken[] = [];
	let cursor = 0;

	for (const match of text.matchAll(GLOSSARY_PATTERN)) {
		const matchText = match[0];
		const matchIndex = match.index ?? 0;

		if (matchIndex > cursor) {
			tokens.push({
				text: text.slice(cursor, matchIndex),
				key: `text-${cursor}`,
			});
		}

		tokens.push({
			text: matchText,
			key: `term-${matchIndex}-${matchText}`,
			entry: GLOSSARY_BY_LABEL.get(matchText),
		});

		cursor = matchIndex + matchText.length;
	}

	if (cursor < text.length) {
		tokens.push({
			text: text.slice(cursor),
			key: `text-${cursor}`,
		});
	}

	return tokens;
}

export function GlossaryText({ text }: { text: string }) {
	const tokens = tokenizeGlossaryText(text);

	return (
		<>
			{tokens.map(({ text: tokenText, key, entry }) => {
				if (!entry) {
					return tokenText;
				}

				return (
					<GlossaryTerm
						key={key}
						description={entry.description}
						kind={entry.kind}
					>
						{tokenText}
					</GlossaryTerm>
				);
			})}
		</>
	);
}
