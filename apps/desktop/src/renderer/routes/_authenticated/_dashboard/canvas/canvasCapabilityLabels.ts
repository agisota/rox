import type { CanvasCapabilityRisk } from "@rox/shared/canvas";

/**
 * Russian display strings for host canvas capabilities. The host router returns
 * canonical English `label`/`description`; this map localises the ones the
 * surface actually exposes. Unknown capability ids fall back to a humanised
 * version of the id so the palette never shows a blank row.
 */
interface CanvasCapabilityCopy {
	title: string;
	description: string;
}

const CANVAS_CAPABILITY_COPY: Record<string, CanvasCapabilityCopy> = {
	"canvas.zoomToFit": {
		title: "Показать весь холст",
		description: "Вписать весь граф документа в видимую область.",
	},
	"canvas.zoomToSelection": {
		title: "Показать выделение",
		description: "Вписать выделенные узлы и связи в видимую область.",
	},
	"canvas.autoLayout": {
		title: "Авто-раскладка",
		description: "Пересчитать позиции узлов и групп через батч мутаций.",
	},
	"canvas.cleanLayout": {
		title: "Чистая раскладка",
		description: "Выровнять отступы узлов и пересечения связей.",
	},
	"canvas.alignLeft": {
		title: "Выровнять по левому краю",
		description: "Выровнять выделенные узлы по самой левой координате.",
	},
	"canvas.alignCenter": {
		title: "Выровнять по центру",
		description: "Выровнять центры выделенных узлов.",
	},
	"canvas.alignRight": {
		title: "Выровнять по правому краю",
		description: "Выровнять выделенные узлы по самому правому краю.",
	},
	"canvas.distributeHorizontal": {
		title: "Распределить по горизонтали",
		description: "Равномерно распределить выделенные узлы по оси X.",
	},
	"canvas.distributeVertical": {
		title: "Распределить по вертикали",
		description: "Равномерно распределить выделенные узлы по оси Y.",
	},
	"canvas.groupSelection": {
		title: "Сгруппировать",
		description: "Создать группу вокруг выделенных узлов.",
	},
	"canvas.ungroupSelection": {
		title: "Разгруппировать",
		description: "Удалить выделенные группы и снять привязку узлов.",
	},
	"canvas.linkSelectedNodes": {
		title: "Связать узлы",
		description: "Создать направленные связи между выделенными узлами.",
	},
	"canvas.generateSuggestedEdges": {
		title: "Предложить связи",
		description: "Предложить недостающие связи по контексту выделения.",
	},
	"canvas.summarizeSelection": {
		title: "Суммаризировать выделение",
		description: "Свести выделенные сущности в узел-заметку через агента.",
	},
	"canvas.extractTasks": {
		title: "Извлечь задачи",
		description: "Создать узлы-задачи из контекста выделения через агента.",
	},
	"canvas.showBacklinks": {
		title: "Показать обратные ссылки",
		description: "Перечислить связи и ссылки для выделенных узлов.",
	},
	"canvas.findOrphans": {
		title: "Найти изолированные узлы",
		description: "Найти узлы без входящих и исходящих связей.",
	},
	"canvas.findCycles": {
		title: "Найти циклы",
		description: "Обнаружить направленные циклы в графе документа.",
	},
	"canvas.explainGraph": {
		title: "Объяснить граф",
		description: "Объяснить связи, направление рёбер и структуру групп.",
	},
	"canvas.exportJsonCanvas": {
		title: "Экспорт JSON Canvas",
		description: "Сериализовать документ в открытый формат Obsidian.",
	},
	"canvas.exportMarkdownMap": {
		title: "Экспорт Markdown-карты",
		description: "Экспортировать узлы, связи и группы как Markdown-карту.",
	},
	"canvas.validateDocument": {
		title: "Проверить документ",
		description: "Проверить документ по канонической схеме и ссылкам.",
	},
	"canvas.validateMutationReplay": {
		title: "Проверить реплей мутаций",
		description: "Повторить батчи мутаций и сверить с канонической копией.",
	},
};

const CANVAS_RISK_LABELS: Record<CanvasCapabilityRisk, string> = {
	read: "чтение",
	write: "запись",
	agent: "агент",
	export: "экспорт",
	import: "импорт",
	destructive: "удаление",
};

function humaniseCapabilityId(capabilityId: string): string {
	const bare = capabilityId.replace(/^canvas\./, "");
	const spaced = bare.replace(/([a-z])([A-Z])/g, "$1 $2");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function getCanvasCapabilityCopy(
	capabilityId: string,
	fallbackLabel?: string,
): CanvasCapabilityCopy {
	const copy = CANVAS_CAPABILITY_COPY[capabilityId];
	if (copy) return copy;
	return {
		title: fallbackLabel ?? humaniseCapabilityId(capabilityId),
		description: `Запустить ${capabilityId} для активного холста.`,
	};
}

export function getCanvasRiskLabel(risk: CanvasCapabilityRisk): string {
	return CANVAS_RISK_LABELS[risk] ?? risk;
}
