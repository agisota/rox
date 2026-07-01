import { describe, expect, test } from "bun:test";
import {
	buildFusionTaskListSql,
	parseFusionTaskListJsonOutput,
	toRoxFusionTaskMirrorEntries,
} from "./sqlite";

describe("Fusion sqlite task mirror", () => {
	test("builds a bounded read-only task list query", () => {
		expect(buildFusionTaskListSql({ limit: 500 })).toContain("limit 200");
		expect(buildFusionTaskListSql()).toContain("\"column\" != 'archived'");
		expect(buildFusionTaskListSql({ includeArchived: true })).not.toContain(
			"\"column\" != 'archived'",
		);
	});

	test("parses sqlite JSON task rows into Rox mirror entries", () => {
		const tasks = parseFusionTaskListJsonOutput(`[
  {
    "id": "FN-1",
    "lineageId": "lin-1",
    "title": null,
    "description": "Ship Fusion mirror",
    "priority": "normal",
    "column": "in-progress",
    "status": null,
    "size": null,
    "currentStep": 0,
    "paused": 0,
    "userPaused": 0,
    "dependencies": "[]",
    "steps": "[{\\"name\\":\\"Implement\\",\\"status\\":\\"done\\"}]",
    "attachments": "[]",
    "comments": "[]",
    "steeringComments": "[]",
    "workflowStepResults": "[]",
    "customFields": "{}",
    "createdAt": "2026-06-23T10:00:00.000Z",
    "updatedAt": "2026-06-23T10:01:00.000Z",
    "deletedAt": null
  }
]`);
		const entries = toRoxFusionTaskMirrorEntries(tasks);

		expect(entries[0]?.task.sourceTaskId).toBe("FN-1");
		expect(entries[0]?.task.status).toBe("working");
		expect(entries[0]?.steps[0]?.status).toBe("succeeded");
	});
});
