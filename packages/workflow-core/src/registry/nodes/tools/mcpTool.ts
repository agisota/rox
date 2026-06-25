import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * MCP Tool — calls a `tool` exposed by an MCP `server` with an `arguments` map
 * (param → value). The `server` uses the dynamic `mcpServers` option source
 * (bound by the editor; until then it renders with a "not found" hint, never
 * blocking). Design-time only in this slice — `out` carries the result, `error`
 * a call failure.
 */
export const mcpToolNodeType: NodeTypeDefinition = {
	id: "mcp_tool",
	category: NodeCategory.Tools,
	label: "MCP-инструмент",
	description: "Вызов инструмента MCP-сервера",
	render: {
		icon: "Plug",
		iconClass: "text-teal-500",
		miniMapColor: "#14b8a6",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out" }, { name: "error" }],
	configSchema: z
		.object({
			server: z.string().min(1).max(200).optional(),
			tool: z.string().min(1).max(200).optional(),
			arguments: z.record(z.string(), z.string()).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "server",
			kind: "select",
			label: "MCP-сервер",
			placeholder: "Выберите сервер",
			optionsSource: "mcpServers",
			required: true,
			description: "Какой MCP-сервер предоставляет инструмент.",
		},
		{
			key: "tool",
			kind: "text",
			label: "Инструмент",
			placeholder: "Имя инструмента на сервере",
			required: true,
			maxLength: 200,
		},
		{
			key: "arguments",
			kind: "key-value",
			label: "Аргументы (имя → значение)",
			description: "Значения могут ссылаться на контекст выполнения.",
		},
	],
};
