import type { ChatPaneData } from "../../../../types";

export interface FusionLaunchTask {
	sourceTaskId: string;
	sourceLineageId?: string;
	title: string;
	description: string;
	status: string;
	branch?: string;
	prUrl?: string;
	labels: string[];
	provenance?: Record<string, unknown>;
}

export interface FusionLaunchStep {
	blockName?: string;
	status: string;
	output?: Record<string, unknown>;
}

export interface FusionLaunchEntry {
	task: FusionLaunchTask;
	steps: FusionLaunchStep[];
}

export function buildFusionTaskLaunch(
	entry: FusionLaunchEntry,
): NonNullable<ChatPaneData["launchConfig"]> {
	const taskId = entry.task.sourceTaskId;
	const markdown = buildFusionTaskMarkdown(entry);
	return {
		initialPrompt: [
			`Запусти задачу Fusion ${taskId}: ${entry.task.title}.`,
			"Используй вложенный markdown как источник контекста, проверь текущий workspace, выполни задачу end-to-end и сообщи running/success/error state.",
		].join("\n\n"),
		initialFiles: [
			{
				data: encodeAsDataUrl(markdown, "text/markdown"),
				mediaType: "text/markdown",
				filename: `fusion-task-${sanitizeFilename(taskId)}.md`,
			},
		],
		taskSlug: taskId,
	};
}

export function buildFusionTaskMarkdown(entry: FusionLaunchEntry): string {
	const task = entry.task;
	const lines = [
		"# Fusion task",
		"",
		`- ID: ${task.sourceTaskId}`,
		`- Status: ${task.status}`,
		...(task.sourceLineageId ? [`- Lineage: ${task.sourceLineageId}`] : []),
		...(task.branch ? [`- Branch: ${task.branch}`] : []),
		...(task.prUrl ? [`- PR: ${task.prUrl}`] : []),
		...(task.labels.length > 0 ? [`- Labels: ${task.labels.join(", ")}`] : []),
		"",
		"## Title",
		task.title,
		"",
		"## Description",
		task.description || "Описание отсутствует.",
		"",
		"## Steps",
	];

	if (entry.steps.length === 0) {
		lines.push("Шаги не заданы.");
	} else {
		for (const [index, step] of entry.steps.entries()) {
			lines.push(
				`${index + 1}. ${step.blockName ?? `Step ${index + 1}`} — ${step.status}`,
			);
			const description = step.output?.description;
			if (typeof description === "string" && description.trim()) {
				lines.push(`   ${description.trim()}`);
			}
		}
	}

	return `${lines.join("\n")}\n`;
}

function encodeAsDataUrl(content: string, mediaType: string): string {
	const bytes = new TextEncoder().encode(content);
	const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
		"",
	);
	const base64 =
		typeof btoa === "function"
			? btoa(binary)
			: Buffer.from(content, "utf-8").toString("base64");
	return `data:${mediaType};base64,${base64}`;
}

function sanitizeFilename(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}
