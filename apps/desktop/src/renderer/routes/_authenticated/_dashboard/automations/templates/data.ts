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
		label: "Статусы",
		templates: [
			{
				id: "standup",
				emoji: "🟣",
				description: "Сводка вчерашней активности Git для стендапа.",
				name: "Ежедневная сводка для стендапа",
				prompt:
					"Суммируй вчерашнюю активность Git в этом репозитории для стендапа. Сгруппируй по авторам. Отметь блокеры и все, что не было доведено до конца.",
				rrule: WEEKDAYS_9AM,
			},
			{
				id: "weekly-pr-digest",
				emoji: "📝",
				description:
					"Соберите PR, релизы, инциденты и ревью за неделю в еженедельный апдейт.",
				name: "Еженедельный апдейт команды",
				prompt:
					"Собери смерженные PR, релизы, инциденты и ревью за эту неделю в краткий еженедельный апдейт. Сгруппируй по темам. Добавь ссылки на каждый пункт.",
				rrule: WEEKLY_FRIDAY_5PM,
			},
			{
				id: "team-pr-recap",
				emoji: "🗞️",
				description:
					"Сводка PR за прошлую неделю по участникам и темам с выделением рисков.",
				name: "Еженедельная сводка PR",
				prompt:
					"Суммируй PR за прошлую неделю, сгруппировав по участникам и темам. Отметь риски, регрессии и все, что требует продолжения.",
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
					"Черновик еженедельных release notes по смерженным PR со ссылками, где возможно.",
				name: "Черновик еженедельных release notes",
				prompt:
					"Подготовь черновик release notes за последние 7 дней по смерженным PR. Сгруппируй по feature / fix / chore. Добавь ссылки на PR, где они доступны.",
				rrule: WEEKLY_FRIDAY_5PM,
			},
			{
				id: "pre-release-check",
				emoji: "✅",
				description:
					"Перед тегированием проверь changelog, миграции, feature flags и тесты.",
				name: "Предрелизный аудит",
				prompt:
					"Предрелизный аудит: проверь, что changelog актуален, ожидающие миграции выполнены, feature flags имеют корректные значения по умолчанию, а тесты зеленые. Отметь все, что должно заблокировать релиз.",
				rrule: WEEKLY_FRIDAY_5PM,
			},
			{
				id: "changelog-update",
				emoji: "✏️",
				description:
					"Обнови changelog главными изменениями недели и ссылками на ключевые PR.",
				name: "Обновление changelog",
				prompt:
					"Обнови CHANGELOG.md главными изменениями недели. Добавь ссылки на ключевые PR и сохрани тон предыдущих записей.",
				rrule: WEEKLY_FRIDAY_5PM,
			},
		],
	},
	{
		id: "quality",
		label: "Качество и стабильность",
		templates: [
			{
				id: "bug-scan",
				emoji: "🐞",
				description:
					"Просканируй недавние коммиты на вероятные баги и предложи минимальные исправления.",
				name: "Ежедневный поиск багов",
				prompt:
					"Просканируй коммиты за последние 24 часа на вероятные баги, регрессии или небезопасные паттерны. Предложи минимальные исправления с diff, где возможно.",
				rrule: DAILY_9AM,
			},
			{
				id: "ci-failures",
				emoji: "🧪",
				description:
					"Суммируй сбои CI и flaky-тесты за последний CI-интервал; предложи главные исправления.",
				name: "Сводка состояния CI",
				prompt:
					"Суммируй сбои CI и flaky-тесты за последние 24 часа. Сгруппируй по root cause. Предложи три главных исправления.",
				rrule: DAILY_9AM,
			},
			{
				id: "benchmark-regressions",
				emoji: "👍",
				description:
					"Сравни недавние изменения с benchmark или trace и заранее отметь регрессии.",
				name: "Отслеживание регрессий benchmark",
				prompt:
					"Сравни недавние изменения с benchmark и trace. Заранее отметь регрессии и предложи, какие коммиты проверить первыми.",
				rrule: DAILY_9AM,
			},
		],
	},
	{
		id: "growth",
		label: "Рост",
		templates: [
			{
				id: "skill-deepening",
				emoji: "🌳",
				description: "По недавним PR и ревью предложи навыки для развития.",
				name: "Рекомендации по развитию навыков",
				prompt:
					"На основе моих недавних PR и комментариев code review предложи 3-5 навыков, которые стоит углубить в следующем квартале. Будь конкретным и дай ссылки на evidence.",
				rrule: WEEKLY_MONDAY_9AM,
			},
			{
				id: "small-side-project",
				emoji: "🎮",
				description: "Создай небольшую классическую игру с минимальным scope.",
				name: "Пет-проект на выходные",
				prompt:
					"Собери каркас небольшой классической игры (snake, pong, minesweeper и т. п.) с минимальным scope. Используй язык, который подходит этому репозиторию. По возможности уложись в один файл.",
			},
		],
	},
];

export const AUTOMATION_TEMPLATES_FLAT: AutomationTemplate[] =
	AUTOMATION_TEMPLATE_CATEGORIES.flatMap((category) => category.templates);
