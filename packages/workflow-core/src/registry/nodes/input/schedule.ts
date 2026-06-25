import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Schedule — a time-based trigger. The author picks a `kind` (`cron` or `rrule`)
 * and supplies the matching `expression`, with an optional IANA `timezone`.
 * Entry point: no inputs, one `out` port. The actual scheduler is a later
 * (execution) slice; here we capture and validate the declaration.
 */
export const scheduleNodeType: NodeTypeDefinition = {
	id: "schedule",
	category: NodeCategory.Input,
	label: "Расписание",
	description: "Триггер по времени (cron/RRULE)",
	render: {
		icon: "Clock",
		iconClass: "text-emerald-500",
		miniMapColor: "#10b981",
	},
	inputs: [],
	outputs: [{ name: "out" }],
	configSchema: z
		.object({
			kind: z.enum(["cron", "rrule"]).optional(),
			expression: z.string().min(1).max(1000).optional(),
			timezone: z.string().max(64).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "kind",
			kind: "select",
			label: "Тип расписания",
			placeholder: "cron или RRULE",
			options: [
				{ value: "cron", label: "Cron" },
				{ value: "rrule", label: "RRULE (iCal)" },
			],
		},
		{
			key: "expression",
			kind: "text",
			label: "Выражение",
			placeholder: "напр. 0 9 * * 1-5 или FREQ=DAILY;BYHOUR=9",
			description: "Cron-строка или RRULE в зависимости от типа.",
			required: true,
			maxLength: 1000,
		},
		{
			key: "timezone",
			kind: "text",
			label: "Часовой пояс",
			placeholder: "напр. Europe/Moscow (необязательно)",
			maxLength: 64,
		},
	],
};
