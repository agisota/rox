/**
 * A template is a partial automation + presentation metadata. Applying a
 * template pre-fills the create-automation form with name/prompt/agent/rrule;
 * device, project, and timezone still come from the user's current selection.
 */
export interface AutomationTemplate {
	id: string;
	// --- presentation ---
	emoji: string;
	description: string;
	// --- automation defaults ---
	name: string;
	prompt: string;
	agentType?: string;
	rrule?: string;
}

export interface AutomationTemplateCategory {
	id: string;
	label: string;
	templates: AutomationTemplate[];
}

const DAILY_9AM = "FREQ=DAILY;BYHOUR=9;BYMINUTE=0";
const WEEKDAYS_9AM = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0";
const WEEKLY_MONDAY_9AM = "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0";
const WEEKLY_FRIDAY_5PM = "FREQ=WEEKLY;BYDAY=FR;BYHOUR=17;BYMINUTE=0";

export const AUTOMATION_TEMPLATE_CATEGORIES: AutomationTemplateCategory[] = [
	{
		id: "status-reports",
		label: "Отчёты о статусе",
		templates: [
			{
				id: "standup",
				emoji: "🟣",
				description: "Сводка вчерашней git-активности для стендапа.",
				name: "Ежедневная сводка для стендапа",
				prompt:
					"Сделай сводку вчерашней git-активности в этом репозитории для стендапа. Сгруппируй по авторам. Отметь блокеры и всё, что не довели до конца.",
				rrule: WEEKDAYS_9AM,
			},
			{
				id: "weekly-pr-digest",
				emoji: "📝",
				description:
					"Сведи PR, выкатки, инциденты и ревью за неделю в еженедельный отчёт.",
				name: "Еженедельный отчёт команды",
				prompt:
					"Сведи влитые за неделю PR, выкатки, инциденты и ревью в краткий еженедельный отчёт. Сгруппируй по темам. Добавь ссылку на каждый пункт.",
				rrule: WEEKLY_FRIDAY_5PM,
			},
			{
				id: "team-pr-recap",
				emoji: "🗞️",
				description:
					"Сводка PR за прошлую неделю по участникам и темам; отметь риски.",
				name: "Еженедельный обзор PR",
				prompt:
					"Сделай сводку PR за прошлую неделю, сгруппировав по участникам команды и темам. Отметь риски, регрессии и всё, что требует доработки.",
				rrule: WEEKLY_MONDAY_9AM,
			},
		],
	},
	{
		id: "release-prep",
		label: "Подготовка релиза",
		templates: [
			{
				id: "release-notes",
				emoji: "📖",
				description:
					"Черновик еженедельных заметок о релизе из влитых PR (со ссылками, если есть).",
				name: "Черновик заметок о релизе за неделю",
				prompt:
					"Подготовь черновик заметок о релизе по влитым PR за последние 7 дней. Сгруппируй по разделам: функции / исправления / рутина. Добавь ссылки на PR, если они есть.",
				rrule: WEEKLY_FRIDAY_5PM,
			},
			{
				id: "pre-release-check",
				emoji: "✅",
				description:
					"Перед тегом проверь changelog, миграции, фиче-флаги и тесты.",
				name: "Аудит перед релизом",
				prompt:
					"Аудит перед релизом: проверь, что changelog актуален, ожидающие миграции выполнены, фиче-флаги имеют правильные значения по умолчанию, а тесты зелёные. Отметь всё, что должно заблокировать релиз.",
				rrule: WEEKLY_FRIDAY_5PM,
			},
			{
				id: "changelog-update",
				emoji: "✏️",
				description:
					"Обнови changelog ключевыми событиями недели и ссылками на важные PR.",
				name: "Обновление changelog",
				prompt:
					"Обнови CHANGELOG.md ключевыми событиями этой недели. Добавь ссылки на важные PR и сохрани стиль предыдущих записей.",
				rrule: WEEKLY_FRIDAY_5PM,
			},
		],
	},
	{
		id: "quality",
		label: "Качество и здоровье",
		templates: [
			{
				id: "bug-scan",
				emoji: "🐞",
				description:
					"Проверь свежие коммиты (с прошлого запуска или за 24 ч) на вероятные баги и предложи минимальные исправления.",
				name: "Ежедневный поиск багов",
				prompt:
					"Проверь коммиты за последние 24 часа на вероятные баги, регрессии и небезопасные паттерны. Предложи минимальные исправления с диффами, где это возможно.",
				rrule: DAILY_9AM,
			},
			{
				id: "ci-failures",
				emoji: "🧪",
				description:
					"Сводка падений CI и нестабильных тестов за последнее окно CI; предложи главные исправления.",
				name: "Сводка о здоровье CI",
				prompt:
					"Сделай сводку падений CI и нестабильных тестов за последние 24 часа. Сгруппируй по первопричине. Предложи три главных исправления.",
				rrule: DAILY_9AM,
			},
			{
				id: "benchmark-regressions",
				emoji: "👍",
				description:
					"Сравни свежие изменения с бенчмарками или трейсами и заранее отметь регрессии.",
				name: "Контроль регрессий бенчмарков",
				prompt:
					"Сравни свежие изменения с бенчмарками и трейсами. Заранее отметь регрессии и подскажи, какие коммиты исследовать в первую очередь.",
				rrule: DAILY_9AM,
			},
		],
	},
	{
		id: "growth",
		label: "Развитие",
		templates: [
			{
				id: "skill-deepening",
				emoji: "🌳",
				description:
					"На основе свежих PR и ревью предложи навыки, которые стоит прокачать.",
				name: "Идеи для роста навыков",
				prompt:
					"На основе моих свежих PR и комментариев из код-ревью предложи 3–5 навыков, которые мне стоит углубить в следующем квартале. Будь конкретным и приводи подтверждения со ссылками.",
				rrule: WEEKLY_MONDAY_9AM,
			},
			{
				id: "small-side-project",
				emoji: "🎮",
				description:
					"Создай небольшую классическую игру с минимальным объёмом.",
				name: "Сайд-проект на выходные",
				prompt:
					"Сделай каркас небольшой классической игры (змейка, понг, сапёр и т. п.) с минимальным объёмом. Используй язык, который подходит этому репозиторию. По возможности уложись в один файл.",
			},
		],
	},
];

export const AUTOMATION_TEMPLATES_FLAT: AutomationTemplate[] =
	AUTOMATION_TEMPLATE_CATEGORIES.flatMap((category) => category.templates);
