import { describe, expect, test } from "bun:test";
import {
	buildFusionNodeListCommand,
	buildFusionTaskCreateCommand,
	parseFusionNodeListOutput,
	parseFusionNodeListRunResult,
	parseFusionProjectListOutput,
	parseFusionProjectListRunResult,
	parseFusionTaskCreateOutput,
	parseFusionTaskCreateRunResult,
} from "./cli";

describe("Fusion CLI boundary", () => {
	test("builds task create argv without shell interpolation", () => {
		const command = buildFusionTaskCreateCommand({
			description: "Fix branch sync; rm -rf nope",
			node: "local",
			project: "rox",
			dependencies: ["FN-1"],
			attachments: ["/tmp/evidence.txt"],
		});

		expect(command.command).toBe("fn");
		expect(command.args).toEqual([
			"--project",
			"rox",
			"task",
			"create",
			"Fix branch sync; rm -rf nope",
			"--no-dedup",
			"--node",
			"local",
			"--depends",
			"FN-1",
			"--attach",
			"/tmp/evidence.txt",
		]);
	});

	test("parses task create output", () => {
		const result = parseFusionTaskCreateOutput(`
  ✓ Created FN-204: Build adapter
    Column: triage
    Path:   .fusion/tasks/FN-204/
`);
		expect(result.taskId).toBe("FN-204");
		expect(result.column).toBe("triage");
		expect(result.path).toBe(".fusion/tasks/FN-204/");
		expect(result.linkedExisting).toBe(false);
	});

	test("parses JSON output after Fusion diagnostic prelude", () => {
		const projects = parseFusionProjectListOutput(`[title-id-drift] ok
[
  {
    "id": "proj_1",
    "name": "rox",
    "path": "/repo",
    "status": "active",
    "isolationMode": "in-process",
    "createdAt": "2026-06-23T10:00:00.000Z",
    "updatedAt": "2026-06-23T10:01:00.000Z"
  }
]`);
		const nodes = parseFusionNodeListOutput(`[
  {
    "id": "node_1",
    "name": "local",
    "type": "local",
    "status": "online",
    "maxConcurrent": 4,
    "createdAt": "2026-06-23T10:00:00.000Z",
    "updatedAt": "2026-06-23T10:01:00.000Z"
  }
]`);

		expect(projects[0]?.name).toBe("rox");
		expect(nodes[0]?.status).toBe("online");
		expect(buildFusionNodeListCommand().args).toEqual([
			"node",
			"list",
			"--json",
		]);
	});

	test("parses list stdout even when Fusion CLI had to be timed out", () => {
		const created = parseFusionTaskCreateRunResult({
			stdout: "✓ Created FN-205: Build adapter",
			stderr: "",
			exitCode: 0,
			timedOut: true,
		});
		const projects = parseFusionProjectListRunResult({
			stdout: `[title-id-drift] archive-db normalized
[
  {
    "id": "proj_1",
    "name": "rox",
    "path": "/repo",
    "status": "active",
    "isolationMode": "in-process",
    "createdAt": "2026-06-23T10:00:00.000Z",
    "updatedAt": "2026-06-23T10:01:00.000Z"
  }
]`,
			stderr: "",
			exitCode: 0,
			timedOut: true,
		});
		const nodes = parseFusionNodeListRunResult({
			stdout: `[
  {
    "id": "node_1",
    "name": "local",
    "type": "local",
    "status": "online",
    "maxConcurrent": 4,
    "createdAt": "2026-06-23T10:00:00.000Z",
    "updatedAt": "2026-06-23T10:01:00.000Z"
  }
]`,
			stderr: "",
			exitCode: 0,
			timedOut: true,
		});

		expect(created.taskId).toBe("FN-205");
		expect(projects[0]?.id).toBe("proj_1");
		expect(nodes[0]?.id).toBe("node_1");
	});
});
