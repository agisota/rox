import {
	type AgentPresetPatch,
	buildFileCommandFromAgentConfig,
	type ResolvedAgentConfig,
	renderTaskPromptTemplate,
	validateTaskPromptTemplate,
} from "@rox/shared/agent-settings";
import type { AgentEditableField } from "./agent-card.types";

const SAMPLE_TASK = {
	id: "task_agent_settings",
	slug: "desktop-agent-settings",
	title: "Настройки десктоп-агента",
	description: "Реализовать архитектуру настроек десктоп-агента.",
	priority: "high",
	statusName: "Todo",
	labels: ["desktop", "agents"],
};

export function getPreviewPrompt(preset: ResolvedAgentConfig): string {
	return renderTaskPromptTemplate(preset.taskPromptTemplate, SAMPLE_TASK);
}

export function getPreviewNoPromptCommand(preset: ResolvedAgentConfig): string {
	if (preset.kind !== "terminal") {
		return "Rox откроет панель чата без команды оболочки.";
	}

	return preset.command.trim() || "Команда не настроена.";
}

export function getPreviewTaskCommand(preset: ResolvedAgentConfig): string {
	if (preset.kind !== "terminal") {
		return preset.model
			? `Rox откроется с моделью ${preset.model}.`
			: "Rox откроется с отрисованным промптом задачи.";
	}

	return (
		buildFileCommandFromAgentConfig({
			filePath: `rox/task-${SAMPLE_TASK.slug}.md`,
			config: preset,
		}) ?? "Не настроена команда с поддержкой промпта."
	);
}

export function getAgentFieldValue(
	preset: ResolvedAgentConfig,
	field: AgentEditableField,
): string {
	switch (field) {
		case "label":
			return preset.label;
		case "description":
			return preset.description ?? "";
		case "command":
			return preset.kind === "terminal" ? preset.command : "";
		case "promptCommand":
			return preset.kind === "terminal" ? preset.promptCommand : "";
		case "promptCommandSuffix":
			return preset.kind === "terminal"
				? (preset.promptCommandSuffix ?? "")
				: "";
		case "taskPromptTemplate":
			return preset.taskPromptTemplate;
		case "model":
			return preset.kind === "chat" ? (preset.model ?? "") : "";
	}
}

export function buildAgentFieldPatch({
	preset,
	field,
	value,
}: {
	preset: ResolvedAgentConfig;
	field: AgentEditableField;
	value: string;
}): { patch: AgentPresetPatch } | { error: string } {
	switch (field) {
		case "label":
			if (!value.trim()) {
				return { error: "Название обязательно." };
			}
			return { patch: { label: value } };
		case "description":
			return { patch: { description: value || null } };
		case "command":
			if (preset.kind !== "terminal") {
				return { error: "Команда доступна только для терминальных агентов." };
			}
			if (!value.trim()) {
				return { error: "Команда обязательна для терминальных агентов." };
			}
			return { patch: { command: value } };
		case "promptCommand":
			if (preset.kind !== "terminal") {
				return {
					error: "Команда промпта доступна только для терминальных агентов.",
				};
			}
			if (!value.trim()) {
				return preset.source === "user"
					? { patch: { promptCommand: "" } }
					: {
							error: "Команда промпта обязательна для терминальных агентов.",
						};
			}
			return { patch: { promptCommand: value } };
		case "promptCommandSuffix":
			if (preset.kind !== "terminal") {
				return {
					error:
						"Суффикс команды промпта доступен только для терминальных агентов.",
				};
			}
			return { patch: { promptCommandSuffix: value || null } };
		case "taskPromptTemplate": {
			if (!value.trim()) {
				return { error: "Шаблон промпта задачи обязателен." };
			}
			const templateValidation = validateTaskPromptTemplate(value);
			if (!templateValidation.valid) {
				return {
					error: `Неизвестные переменные: ${templateValidation.unknownVariables.join(", ")}`,
				};
			}
			return { patch: { taskPromptTemplate: value } };
		}
		case "model":
			if (preset.kind !== "chat") {
				return {
					error: "Переопределение модели доступно только для чат-агентов.",
				};
			}
			return { patch: { model: value || null } };
	}
}
