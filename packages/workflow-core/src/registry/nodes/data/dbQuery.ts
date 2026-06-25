import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * DB Query — runs a read `sql` statement against a bound `connection` with
 * optional named `params` (param → value). The `connection` uses the dynamic
 * `dbConnections` option source (bound by the editor; until then it renders with
 * a "not found" hint, never blocking). Design-time only in this slice — `out`
 * carries the rows, `error` a query failure.
 */
export const dbQueryNodeType: NodeTypeDefinition = {
	id: "db_query",
	category: NodeCategory.Data,
	label: "SQL-запрос",
	description: "Чтение данных из БД",
	render: {
		icon: "Database",
		iconClass: "text-sky-500",
		miniMapColor: "#0ea5e9",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out", type: "array" }, { name: "error" }],
	configSchema: z
		.object({
			connection: z.string().min(1).max(200).optional(),
			sql: z.string().min(1).max(20000).optional(),
			params: z.record(z.string(), z.string()).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "connection",
			kind: "select",
			label: "Подключение",
			placeholder: "Выберите подключение",
			optionsSource: "dbConnections",
			required: true,
			description: "К какой БД выполнять запрос.",
		},
		{
			key: "sql",
			kind: "textarea",
			label: "SQL",
			placeholder: "SELECT * FROM users WHERE id = :id",
			description: "Именованные параметры (:name) берутся из «Параметры».",
			required: true,
			maxLength: 20000,
		},
		{
			key: "params",
			kind: "key-value",
			label: "Параметры (имя → значение)",
			description: "Значения могут ссылаться на контекст выполнения.",
		},
	],
};
