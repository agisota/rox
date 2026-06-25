import type { SurfaceTourId } from "@rox/shared/onboarding";
import { REQUIRED_SURFACE_TOURS } from "@rox/shared/onboarding";

export const REQUIRED_SURFACE_TOUR_IDS = REQUIRED_SURFACE_TOURS;

export interface OnboardingTourStep {
	id: string;
	anchor: string;
	title: string;
	body: string;
	action: string;
	route: string;
}

export interface OnboardingTourDefinition {
	id: SurfaceTourId;
	surfaceName: string;
	required: boolean;
	steps: OnboardingTourStep[];
}

export const ONBOARDING_TOURS: Record<SurfaceTourId, OnboardingTourDefinition> =
	{
		workspaces: {
			id: "workspaces",
			surfaceName: "Рабочие пространства",
			required: true,
			steps: [
				{
					id: "open-workspaces",
					anchor: "nav-workspaces",
					title: "Дом рабочих сессий",
					body: "Здесь Rox собирает проекты и workspace. Начинайте отсюда, когда нужно вернуться к работе или открыть новую задачу.",
					action: "Откройте список или создайте новый workspace.",
					route: "/v2-workspaces",
				},
			],
		},
		workspace: {
			id: "workspace",
			surfaceName: "Workspace",
			required: true,
			steps: [
				{
					id: "workspace-chat",
					anchor: "workspace-chat",
					title: "Задача, чат и изменения вместе",
					body: "Workspace хранит контекст одной задачи: чат, терминал, файлы, изменения и PR-состояние.",
					action: "Отправьте короткий запрос или откройте существующий чат.",
					route: "/v2-workspace",
				},
			],
		},
		quick_chat: {
			id: "quick_chat",
			surfaceName: "Быстрый чат",
			required: true,
			steps: [
				{
					id: "quick-chat-input",
					anchor: "quick-chat-input",
					title: "Быстрый вопрос без workspace",
					body: "Быстрый чат подходит для коротких вопросов, когда не нужна отдельная рабочая сессия.",
					action: "Откройте быстрый чат и задайте один вопрос.",
					route: "/quick-chat",
				},
			],
		},
		tasks_pr: {
			id: "tasks_pr",
			surfaceName: "Задачи и PR",
			required: true,
			steps: [
				{
					id: "tasks-create",
					anchor: "tasks-create",
					title: "Планирование связано с GitHub",
					body: "Задачи и PR связывают план, исполнение агентом и проверку результата.",
					action: "Создайте черновик задачи или откройте существующий PR.",
					route: "/tasks",
				},
			],
		},
		automations: {
			id: "automations",
			surfaceName: "Автоматизации",
			required: true,
			steps: [
				{
					id: "automation-create",
					anchor: "automation-create",
					title: "Повторяемая работа без ручного запуска",
					body: "Автоматизации запускают действия по событию или расписанию. Первый шаг безопасен: создать черновик без включения.",
					action: "Откройте автоматизации и создайте черновик.",
					route: "/automations",
				},
			],
		},
		pipelines: {
			id: "pipelines",
			surfaceName: "Пайплайны",
			required: true,
			steps: [
				{
					id: "pipeline-template",
					anchor: "pipeline-template",
					title: "Сценарии из нескольких агентских шагов",
					body: "Пайплайны собирают роли, узлы и проверки в повторяемую цепочку.",
					action: "Откройте шаблон или библиотеку ролей.",
					route: "/pipelines",
				},
			],
		},
		skills_library: {
			id: "skills_library",
			surfaceName: "Библиотека скиллов",
			required: true,
			steps: [
				{
					id: "skill-search",
					anchor: "skill-search",
					title: "Переиспользуемые способности агентов",
					body: "Скиллы добавляют агентам устойчивые инструкции и рабочие приемы.",
					action: "Найдите skill и откройте карточку.",
					route: "/skills-library",
				},
			],
		},
		memory: {
			id: "memory",
			surfaceName: "Память",
			required: true,
			steps: [
				{
					id: "memory-search",
					anchor: "memory-search",
					title: "Что Rox запоминает для будущей работы",
					body: "Память помогает агентам не начинать с нуля и видеть прежние решения.",
					action: "Откройте память и попробуйте поиск.",
					route: "/memory",
				},
			],
		},
		settings: {
			id: "settings",
			surfaceName: "Настройки",
			required: true,
			steps: [
				{
					id: "settings-models",
					anchor: "nav-settings",
					title: "Где управлять провайдерами и поведением Rox",
					body: "В настройках находятся провайдеры, GitHub CLI, разрешения, профиль, внешний вид и экспериментальные функции.",
					action: "Откройте настройки и проверьте один раздел.",
					route: "/settings/account",
				},
			],
		},
	};
