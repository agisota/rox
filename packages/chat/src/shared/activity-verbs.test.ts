import { describe, expect, it } from "bun:test";
import {
	type ActivityVerb,
	formatActivitySummary,
	mapToolToVerb,
} from "./activity-verbs";

describe("mapToolToVerb", () => {
	const cases: Array<[string, ActivityVerb]> = [
		["mastra_workspace_execute_command", "shell"],
		["bash", "shell"],
		["mastra_workspace_read_file", "read"],
		["mastra_workspace_list_files", "read"],
		["mastra_workspace_file_stat", "read"],
		["mastra_workspace_search", "search"],
		["mastra_workspace_index", "search"],
		["mastra_workspace_write_file", "write"],
		["mastra_workspace_edit_file", "write"],
		["ast_smart_edit", "write"],
		["mastra_workspace_delete", "write"],
		["web_fetch", "web"],
		["web_search", "web"],
		["task_write", "skill"],
		["submit_plan", "skill"],
		["something_unknown", "other"],
	];

	for (const [name, verb] of cases) {
		it(`maps ${name} → ${verb}`, () => {
			expect(mapToolToVerb(name)).toBe(verb);
		});
	}

	it("covers write/exec tools (not just read-only)", () => {
		// Regression: legacy inline switch only labeled read-only tools.
		expect(mapToolToVerb("mastra_workspace_write_file")).toBe("write");
		expect(mapToolToVerb("mastra_workspace_execute_command")).toBe("shell");
	});
});

describe("formatActivitySummary", () => {
	it("uses present tense + singular noun for 1 pending read", () => {
		expect(
			formatActivitySummary({ verb: "read", count: 1, tense: "present" }),
		).toBe("Чтение · 1 файл");
	});

	it("uses past tense + plural noun for a settled run", () => {
		expect(
			formatActivitySummary({ verb: "read", count: 3, tense: "past" }),
		).toBe("Прочитано · 3 файлов");
	});

	it("labels shell/exec runs", () => {
		expect(
			formatActivitySummary({ verb: "shell", count: 5, tense: "past" }),
		).toBe("Выполнено · 5 команд");
	});
});
