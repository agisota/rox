import { afterAll, describe, expect, mock, test } from "bun:test";
import { getNodeType } from "@rox/workflow-core";
import { renderToStaticMarkup } from "react-dom/server";
import type { PipelineFlowNode } from "../../graph-adapter";
import type { NodePatchApi } from "../useNodePatch";

/**
 * SSR markup assertions for the registry-driven auto-form (the established web
 * pattern; no DOM harness). We exercise the SSR-safe field kinds (number /
 * textarea / helper text); the `select` kind with a dynamic `optionsSource`
 * (agent_run roles) reads `useQuery` and is covered by the pure `fieldCommit` +
 * registry tests instead (mirrors NodeInspector.test.tsx, which skips agent_run
 * for the same reason). `@/trpc/react` is mocked only to satisfy import
 * resolution.
 */
mock.module("@/trpc/react", () => ({
	useTRPC: () => ({
		agentRole: {
			list: { queryOptions: () => ({ queryKey: [], queryFn: async () => [] }) },
		},
	}),
}));

const { AutoForm } = await import("./AutoForm");

afterAll(() => {
	mock.restore();
});

const noopPatch: NodePatchApi = {
	patchNode: () => {},
	renameNode: () => {},
	deleteNode: () => ({ ok: false, reason: "missing" }),
};

function node(
	type: string,
	subBlocks?: Record<string, unknown>,
): PipelineFlowNode {
	return {
		id: `${type}_1`,
		type: `pipeline_${type}`,
		position: { x: 0, y: 0 },
		data: {
			blockId: `${type}_1`,
			kind: "agent_run",
			blockType: type,
			label: type,
			enabled: true,
			subBlocks,
		},
	};
}

function render(type: string, subBlocks?: Record<string, unknown>) {
	const def = getNodeType(type);
	if (!def) throw new Error(`${type} not registered`);
	return renderToStaticMarkup(
		<AutoForm def={def} node={node(type, subBlocks)} patch={noopPatch} />,
	);
}

describe("AutoForm (registry-driven)", () => {
	test("loop seeds the number field from subBlocks", () => {
		const html = render("loop", { maxIterations: 7 });
		expect(html).toContain("Максимум итераций");
		expect(html).toContain('value="7"');
		expect(html).toContain("Тело цикла настраивается связями на холсте.");
	});

	test("response renders the inspector help + output note textarea", () => {
		const html = render("response");
		expect(html).toContain("завершает выполнение");
		expect(html).toContain("Заметка о результате");
		expect(html).toContain('data-slot="textarea"');
	});

	test("start renders only the helper (no fields)", () => {
		const html = render("start");
		expect(html).toContain("Стартовый узел");
		expect(html).not.toContain('data-slot="input"');
	});
});
