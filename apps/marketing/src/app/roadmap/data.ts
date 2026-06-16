export type RoadmapCategory = "Desktop" | "Web" | "Mobile" | "Integrations";

export type RoadmapStatus = "now" | "next" | "later" | "shipped";

interface RoadmapItemBase {
	id: string;
	title: string;
	description: string;
	category: RoadmapCategory;
}

interface ActiveRoadmapItem extends RoadmapItemBase {
	status: "now" | "next" | "later";
}

interface ShippedRoadmapItem extends RoadmapItemBase {
	status: "shipped";
	shippedDate: string;
}

export type RoadmapItem = ActiveRoadmapItem | ShippedRoadmapItem;

export const CATEGORIES: RoadmapCategory[] = [
	"Desktop",
	"Web",
	"Mobile",
	"Integrations",
];

export const CATEGORY_LABELS: Record<RoadmapCategory, string> = {
	Desktop: "Десктоп",
	Web: "Веб",
	Mobile: "Мобильное",
	Integrations: "Интеграции",
};

export const STATUS_LABELS: Record<RoadmapStatus, string> = {
	now: "В работе",
	next: "Дальше",
	later: "Исследуем",
	shipped: "Недавно выпущено",
};

export const ROADMAP_ITEMS: RoadmapItem[] = [
	// ── Now ──────────────────────────────────────────
	{
		id: "now-1",
		title: "Мобильное companion-приложение",
		description:
			"Следи за работающими агентами и управляй ими с телефона. Подтверждай промпты на ходу.",
		category: "Mobile",
		status: "now",
	},
	{
		id: "now-2",
		title: "Облачные workspaces",
		description:
			"Запускай агентов в облаке с постоянными workspaces — без привязки к локальной машине.",
		category: "Web",
		status: "now",
	},
	{
		id: "now-3",
		title: "Командные workspaces",
		description:
			"Общие workspaces с ролевым доступом, чтобы команды могли вместе вести агентские задачи.",
		category: "Web",
		status: "now",
	},
	{
		id: "now-4",
		title: "Восстановление и сохранение сессий",
		description:
			"Автоматически продолжай сессии агентов после перезапуска приложения или восстановления после сбоя.",
		category: "Desktop",
		status: "now",
	},

	// ── Next ─────────────────────────────────────────
	{
		id: "next-1",
		title: "Расширение для VS Code",
		description:
			"Запускай агентов Rox и управляй ими прямо из боковой панели VS Code.",
		category: "Integrations",
		status: "next",
	},
	{
		id: "next-2",
		title: "Коммуникация агент-агент",
		description:
			"Позволяй агентам делегировать подзадачи другим агентам и обмениваться контекстом.",
		category: "Desktop",
		status: "next",
	},
	{
		id: "next-3",
		title: "Dashboard аналитики использования",
		description:
			"Отслеживай расход токенов, время работы агентов и детализацию стоимости по workspace.",
		category: "Web",
		status: "next",
	},
	{
		id: "next-4",
		title: "Webhook-интеграции",
		description:
			"Запускай агентов по внешним событиям через webhooks: CI pipelines, GitHub, Slack.",
		category: "Integrations",
		status: "next",
	},

	// ── Later ────────────────────────────────────────
	{
		id: "later-1",
		title: "Self-hosted развёртывание",
		description:
			"Запускай Rox на своей инфраструктуре через один Docker Compose файл.",
		category: "Web",
		status: "later",
	},
	{
		id: "later-2",
		title: "Маркетплейс агентов",
		description:
			"Просматривай, устанавливай и публикуй шаблоны агентов и инструменты сообщества.",
		category: "Web",
		status: "later",
	},
	{
		id: "later-3",
		title: "Оркестрация нескольких репозиториев",
		description:
			"Запускай согласованные агентские задачи сразу в нескольких репозиториях.",
		category: "Desktop",
		status: "later",
	},
	{
		id: "later-4",
		title: "Плагин JetBrains",
		description:
			"Полная интеграция Rox для IntelliJ, WebStorm и других JetBrains IDE.",
		category: "Integrations",
		status: "later",
	},

	// ── Shipped ──────────────────────────────────────
	{
		id: "shipped-1",
		title: "Вкладка review и PR-комментарии",
		description:
			"Вкладка review в боковой панели изменений для PR-комментариев и inline-действий.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "март 2026",
	},
	{
		id: "shipped-2",
		title: "Настраиваемые параметры агентов",
		description:
			"Переопределяй presets и просматривай шаблоны конфигурации агентов прямо в UI.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "март 2026",
	},
	{
		id: "shipped-3",
		title: "Редактор CodeMirror",
		description:
			"Заменили Monaco на CodeMirror: 150 KB вместо 5 MB и заметно более быстрая загрузка.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "март 2026",
	},
	{
		id: "shipped-4",
		title: "Поиск между workspaces",
		description:
			"Ищи сразу по всем открытым workspaces с единым списком результатов.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "март 2026",
	},
	{
		id: "shipped-5",
		title: "Chat view в общем доступе",
		description:
			"Chat view стал общедоступным: обновили визуализацию tool calls и расширенные UI cards.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "март 2026",
	},
	{
		id: "shipped-6",
		title: "Выбор моделей разных providers",
		description:
			"Добавили Copilot, Cursor Agent и Gemini рядом с моделями Claude и GPT.",
		category: "Integrations",
		status: "shipped",
		shippedDate: "февраль 2026",
	},
	{
		id: "shipped-7",
		title: "Встроенный браузер",
		description:
			"Браузер в стиле Chrome с автодополнением URL, поддержкой DevTools и инструментами desktop-автоматизации.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "февраль 2026",
	},
	{
		id: "shipped-8",
		title: "Проводник файлов",
		description:
			"Иерархическое дерево с файловыми операциями, material icon theme и drag-and-drop.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "февраль 2026",
	},
	{
		id: "shipped-9",
		title: "Поддержка Linux desktop",
		description: "Нативное Linux desktop-приложение в формате AppImage.",
		category: "Desktop",
		status: "shipped",
		shippedDate: "февраль 2026",
	},
	{
		id: "shipped-10",
		title: "Синхронизация Electric SQL",
		description:
			"Local-first синхронизация задач через Electric SQL и интеграция с Linear через webhooks.",
		category: "Integrations",
		status: "shipped",
		shippedDate: "декабрь 2025",
	},
];
