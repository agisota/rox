import { afterAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PipelineFlowNode, PipelineNodeKind } from "../graph-adapter";
import type { NodePatchApi } from "./useNodePatch";

/**
 * The inspector shell is asserted via SSR markup (the established web pattern,
 * no DOM harness). We exercise the SSR-safe kinds (start/loop/approval/response);
 * the agent_run form reads tRPC and is covered by the pure nodePatch tests.
 * Patch callbacks are never invoked under SSR.
 *
 * `renderer/lib/api-trpc-react` is an import-time singleton (cloud tRPC proxy). We
 * mock it only to satisfy import resolution, then dynamic-import the component and
 * restore the mock so sibling suites are unaffected (mirrors WorkspacePresence
 * test.tsx).
 */
mock.module("renderer/lib/api-trpc-react", () => ({
	useCloudTrpc: () => ({
		agentRole: {
			list: { queryOptions: () => ({ queryKey: [], queryFn: async () => [] }) },
		},
	}),
}));

const { NodeInspector } = await import("./NodeInspector");

afterAll(() => {
	mock.restore();
});
const noopPatch: NodePatchApi = {
	patchNode: () => {},
	renameNode: () => {},
	deleteNode: () => ({ ok: false, reason: "missing" }),
};

function makeNode(
	kind: PipelineNodeKind,
	overrides?: Partial<PipelineFlowNode["data"]>,
): PipelineFlowNode {
	return {
		id: `${kind}_1`,
		type: kind === "start" ? "pipelineStart" : `pipeline_${kind}`,
		position: { x: 0, y: 0 },
		data: {
			blockId: `${kind}_1`,
			kind,
			blockType: kind,
			label: `Узел ${kind}`,
			enabled: true,
			...overrides,
		},
	};
}

function render(node: PipelineFlowNode | null, issues = []) {
	return renderToStaticMarkup(
		<NodeInspector
			selectedNode={node}
			patch={noopPatch}
			issues={issues}
			onClose={() => {}}
			onDeleted={() => {}}
		/>,
	);
}

describe("NodeInspector shell", () => {
	test("renders nothing when no node is selected", () => {
		expect(render(null)).toBe("");
	});

	test("seeds the rename input with the node label", () => {
		const html = render(makeNode("loop"));
		expect(html).toContain('data-slot="input"');
		expect(html).toContain('value="Узел loop"');
	});

	test("start node: no enabled Switch, no delete button", () => {
		const html = render(makeNode("start"));
		// The start helper text appears.
		expect(html).toContain("Стартовый узел");
		// No enable Switch and no delete affordance for start.
		expect(html).not.toContain('data-slot="switch"');
		expect(html).not.toContain("Удалить узел");
	});

	test("non-start node: shows enabled Switch and delete button", () => {
		const html = render(makeNode("loop"));
		expect(html).toContain('data-slot="switch"');
		expect(html).toContain("Удалить узел");
	});

	test("loop node renders the maxIterations field", () => {
		const html = render(makeNode("loop", { subBlocks: { maxIterations: 5 } }));
		expect(html).toContain("Максимум итераций");
		expect(html).toContain('value="5"');
	});

	test("approval node renders the approval message field", () => {
		const html = render(makeNode("human_approval"));
		expect(html).toContain("Сообщение для подтверждения");
		expect(html).toContain('data-slot="textarea"');
	});

	test("response node renders the terminal helper + output note", () => {
		const html = render(makeNode("response"));
		expect(html).toContain("завершает выполнение");
		expect(html).toContain("Заметка о результате");
	});

	test("renders per-block issues filtered by blockId", () => {
		const html = render(makeNode("loop"), [
			{
				code: "UNREACHABLE_BLOCK",
				message: "Узел недостижим из старта",
				blockId: "loop_1",
				severity: "error",
			},
			{
				code: "UNREACHABLE_BLOCK",
				message: "Другой узел недостижим",
				blockId: "other",
				severity: "error",
			},
		] as never);
		expect(html).toContain("Проблемы узла");
		expect(html).toContain("Узел недостижим из старта");
		expect(html).not.toContain("Другой узел недостижим");
	});

	test("hides the issues block when no issue matches this block", () => {
		const html = render(makeNode("loop"));
		expect(html).not.toContain("Проблемы узла");
	});
});
