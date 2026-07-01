import { describe, expect, test } from "bun:test";
import {
	parseFusionNodeRow,
	parseFusionProjectRow,
	parseFusionTaskRow,
} from "./fusionTypes";

describe("Fusion row parsers", () => {
	test("parses a Fusion task sqlite row with JSON columns", () => {
		const task = parseFusionTaskRow({
			id: "FN-123",
			lineageId: "lin-1",
			title: "Ship the adapter",
			description: "Build Fusion adapter",
			priority: "normal",
			column: "in-progress",
			status: "running",
			currentStep: 1,
			paused: 0,
			userPaused: 1,
			branch: "fusion-adapter",
			dependencies: '["FN-122"]',
			steps:
				'[{"name":"Implement","description":"write code","status":"in-progress"}]',
			log: '[{"message":"started","type":"info"}]',
			attachments: "[]",
			comments: "[]",
			steeringComments: "[]",
			workflowStepResults: "[]",
			prInfo: '{"url":"https://github.com/agisota/rox/pull/1"}',
			customFields: '{"owner":"rox"}',
			nodeId: "node-local",
			effectiveNodeId: "node-local",
			createdAt: "2026-06-23T10:00:00.000Z",
			updatedAt: "2026-06-23T10:01:00.000Z",
			deletedAt: null,
		});

		expect(task.id).toBe("FN-123");
		expect(task.column).toBe("in-progress");
		expect(task.userPaused).toBe(true);
		expect(task.dependencies).toEqual(["FN-122"]);
		expect(task.steps[0]?.status).toBe("in-progress");
		expect(task.prInfo?.url).toBe("https://github.com/agisota/rox/pull/1");
	});

	test("parses central project and node rows", () => {
		const project = parseFusionProjectRow({
			id: "proj_1",
			name: "rox",
			path: "/Users/marklindgreen/Projects/RRR/rox",
			status: "active",
			isolationMode: "in-process",
			settings: "{}",
			createdAt: "2026-06-23T10:00:00.000Z",
			updatedAt: "2026-06-23T10:01:00.000Z",
		});
		const node = parseFusionNodeRow({
			id: "node_1",
			name: "local",
			type: "local",
			status: "online",
			maxConcurrent: 4,
			capabilities: "{}",
			systemMetrics: "{}",
			versionInfo: "{}",
			createdAt: "2026-06-23T10:00:00.000Z",
			updatedAt: "2026-06-23T10:01:00.000Z",
		});

		expect(project.path).toContain("/rox");
		expect(node.type).toBe("local");
		expect(node.maxConcurrent).toBe(4);
	});
});
