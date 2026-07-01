import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	discoverFusionStatus,
	discoverFusionTaskMirrors,
	fusionDatabasePaths,
	selectFusionNode,
	selectFusionProject,
} from "./fusion";

const project = {
	id: "proj_1",
	name: "rox",
	path: "/Users/marklindgreen/Projects/RRR/rox",
	status: "active",
	isolationMode: "in-process",
	createdAt: "2026-06-23T10:00:00.000Z",
	updatedAt: "2026-06-23T10:01:00.000Z",
};

const node = {
	id: "node_1",
	name: "local",
	type: "local" as const,
	status: "online",
	maxConcurrent: 4,
	createdAt: "2026-06-23T10:00:00.000Z",
	updatedAt: "2026-06-23T10:01:00.000Z",
};

describe("Fusion host-service discovery", () => {
	test("selects a Fusion project by exact or nested repo path", () => {
		expect(selectFusionProject([project], project.path)?.id).toBe("proj_1");
		expect(
			selectFusionProject([project], `${project.path}/apps/desktop`)?.id,
		).toBe("proj_1");
	});

	test("prefers online local nodes", () => {
		const remoteNode = { ...node, id: "node_2", type: "remote" as const };
		expect(selectFusionNode([remoteNode, node])?.id).toBe("node_1");
	});

	test("builds unavailable status without touching Rox DB", async () => {
		const status = await discoverFusionStatus({
			projectPath: project.path,
			home: "/tmp/rox-fusion-missing",
			client: {
				version: async () => "0.45.0",
				listProjects: async () => [project],
				listNodes: async () => [node],
			} as never,
		});

		expect(status.available).toBe(false);
		expect(status.project?.id).toBe("proj_1");
		expect(status.node?.id).toBe("node_1");
		expect(status.agentSourceDraft).toBeNull();
		expect(fusionDatabasePaths("/tmp/test").project).toContain(
			"/tmp/test/.fusion/fusion.db",
		);
	});

	test("returns Rox task mirrors from an injected Fusion task reader", async () => {
		const home = join(tmpdir(), `rox-fusion-test-${crypto.randomUUID()}`);
		await mkdir(join(home, ".fusion"), { recursive: true });
		await writeFile(join(home, ".fusion", "fusion.db"), "");
		await writeFile(join(home, ".fusion", "fusion-central.db"), "");

		const result = await discoverFusionTaskMirrors({
			projectPath: project.path,
			home,
			client: {
				version: async () => "0.45.0",
				listProjects: async () => [project],
				listNodes: async () => [node],
			} as never,
			listTasks: async () => [
				{
					id: "FN-1",
					title: "Fusion mirror",
					description: "Mirror Fusion tasks into Rox",
					column: "todo",
					currentStep: 0,
					paused: false,
					userPaused: false,
					dependencies: [],
					steps: [{ name: "Map", status: "done" }],
					log: [],
					attachments: [],
					comments: [],
					steeringComments: [],
					workflowStepResults: [],
					customFields: {},
					createdAt: "2026-06-23T10:00:00.000Z",
					updatedAt: "2026-06-23T10:01:00.000Z",
				},
			],
		});

		expect(result.available).toBe(true);
		expect(result.tasks[0]?.task.sourceTaskId).toBe("FN-1");
		expect(result.tasks[0]?.task.status).toBe("todo");
		expect(result.tasks[0]?.steps[0]?.status).toBe("succeeded");
		expect(result.errors).toEqual([]);
	});
});
