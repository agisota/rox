import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Code — runs author-supplied `source` in a chosen `language`, reading named
 * `inputs` and producing named `outputs`. Execution is a hardened, resource- and
 * time-bounded sandbox (issue #526): the runtime runs the source in an isolated
 * `worker_threads` realm with NO host filesystem / network / process access by
 * default, a wall-clock `timeoutMs` (hard kill), and a `memoryLimitMb` heap cap.
 * The convention is to define `main(input)` and return a value; an object return
 * maps onto `out` directly, anything else is wrapped as `{ result }`. Sandbox
 * failures (unsupported language, timeout, memory, runtime throw) route to `error`
 * — never a silent wrong result. `out` carries the return value, `error` a failure.
 */
export const codeNodeType: NodeTypeDefinition = {
	id: "code",
	category: NodeCategory.Code,
	label: "Код",
	description: "Пользовательский код в изолированной песочнице",
	render: {
		icon: "Code",
		iconClass: "text-amber-500",
		miniMapColor: "#f59e0b",
	},
	inputs: [{ name: "in", type: "object", required: true }],
	outputs: [
		{ name: "out", type: "object" },
		{ name: "error", type: "object" },
	],
	configSchema: z
		.object({
			language: z.enum(["javascript", "typescript", "python"]).optional(),
			source: z.string().min(1).max(50000).optional(),
			inputs: z.record(z.string(), z.string()).optional(),
			outputs: z.record(z.string(), z.string()).optional(),
			/** Wall-clock budget (ms). Clamped to [1, 30000] by the runtime. */
			timeoutMs: z.number().int().min(1).max(30000).optional(),
			/** Heap cap (MB). Clamped to [8, 512] by the runtime. */
			memoryLimitMb: z.number().int().min(8).max(512).optional(),
		})
		.passthrough(),
	inspectorHelp:
		"Код выполняется в изолированной песочнице: без доступа к файловой системе, сети и процессу хоста. Определите main(input) и верните значение. Python пока не выполняется на этом хосте.",
	fields: [
		{
			key: "language",
			kind: "select",
			label: "Язык",
			placeholder: "Выберите язык",
			required: true,
			options: [
				{ value: "javascript", label: "JavaScript" },
				{ value: "typescript", label: "TypeScript" },
				{ value: "python", label: "Python" },
			],
		},
		{
			key: "source",
			kind: "textarea",
			label: "Исходный код",
			placeholder: "function main(input) { return { result: input }; }",
			description:
				"Доступен объект input; определите main(input) и верните результат.",
			required: true,
			maxLength: 50000,
		},
		{
			key: "inputs",
			kind: "key-value",
			label: "Входы (имя → выражение)",
			description: "Что передать в код из контекста выполнения.",
			section: "Входы и выходы",
		},
		{
			key: "outputs",
			kind: "key-value",
			label: "Выходы (имя → тип)",
			description: "Какие значения возвращает код.",
			section: "Входы и выходы",
		},
		{
			key: "timeoutMs",
			kind: "number",
			label: "Таймаут (мс)",
			description: "Лимит времени выполнения. Максимум 30000 мс.",
			placeholder: "5000",
			min: 1,
			max: 30000,
			step: 100,
			section: "Песочница",
		},
		{
			key: "memoryLimitMb",
			kind: "number",
			label: "Лимит памяти (МБ)",
			description: "Ограничение кучи воркера. Максимум 512 МБ.",
			placeholder: "128",
			min: 8,
			max: 512,
			step: 8,
			section: "Песочница",
		},
	],
};
