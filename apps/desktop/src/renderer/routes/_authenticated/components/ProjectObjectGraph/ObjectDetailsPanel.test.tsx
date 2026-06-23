import { describe, expect, it, mock } from "bun:test";
import type { ObjectGraphEdge, ObjectGraphNode } from "./ObjectDetailsPanel";

// `ObjectDetailsPanel` now mounts the gated `CommentsSection`, whose static
// import of `renderer/lib/api-trpc-react` eagerly builds the trpc-electron
// client at module load (and throws without an `electronTRPC` global). Stubbing
// just that module keeps importing the panel here (for the pure
// `splitLinkedObjects` test) transport-free; react-query stays real (the hooks
// are never called without a render). Type-only imports above are erased, so
// they do not trigger the eager client.
mock.module("renderer/lib/api-trpc-react", () => ({
	useCloudTrpc: () => ({
		graph: {
			comments: {
				list: {
					queryOptions: (input: unknown) => ({ queryKey: ["comments", input] }),
					queryKey: (input: unknown) => ["comments", input],
				},
				create: { mutationOptions: (opts: unknown) => opts },
			},
		},
	}),
}));

const { splitLinkedObjects } = await import("./ObjectDetailsPanel");

const focus: ObjectGraphNode = {
	entityId: "f1",
	kind: "task",
	title: "Focus task",
	slug: null,
	inProject: true,
};
const note: ObjectGraphNode = {
	entityId: "n1",
	kind: "note",
	title: "Linked note",
	slug: "linked-note",
	inProject: true,
};
const contact: ObjectGraphNode = {
	entityId: "c1",
	kind: "contact",
	title: "Linked contact",
	slug: "linked-contact",
	inProject: false,
};

describe("splitLinkedObjects (object-details edge split)", () => {
	it("separates outgoing (focus is source) from incoming (focus is target)", () => {
		const edges: ObjectGraphEdge[] = [
			{
				id: "e-out",
				sourceEntityId: "f1",
				targetEntityId: "n1",
				relation: "references",
				resolved: true,
			},
			{
				id: "e-in",
				sourceEntityId: "c1",
				targetEntityId: "f1",
				relation: "about",
				resolved: true,
			},
		];

		const { outgoing, incoming } = splitLinkedObjects(
			focus.entityId,
			[focus, note, contact],
			edges,
		);

		expect(outgoing).toHaveLength(1);
		expect(outgoing[0]?.edgeId).toBe("e-out");
		expect(outgoing[0]?.node?.entityId).toBe("n1");

		expect(incoming).toHaveLength(1);
		expect(incoming[0]?.edgeId).toBe("e-in");
		expect(incoming[0]?.node?.entityId).toBe("c1");
	});

	it("resolves the other endpoint to a known node, or null when unsurfaced", () => {
		const edges: ObjectGraphEdge[] = [
			{
				id: "e-dangling",
				sourceEntityId: "f1",
				targetEntityId: "missing",
				relation: "blocks",
				resolved: true,
			},
		];

		const { outgoing } = splitLinkedObjects(focus.entityId, [focus], edges);
		expect(outgoing).toHaveLength(1);
		expect(outgoing[0]?.node).toBeNull();
		expect(outgoing[0]?.otherEntityId).toBe("missing");
	});

	it("ignores edges not incident to the focus node", () => {
		const edges: ObjectGraphEdge[] = [
			{
				id: "e-other",
				sourceEntityId: "n1",
				targetEntityId: "c1",
				relation: "references",
				resolved: true,
			},
		];
		const { outgoing, incoming } = splitLinkedObjects(
			focus.entityId,
			[focus, note, contact],
			edges,
		);
		expect(outgoing).toHaveLength(0);
		expect(incoming).toHaveLength(0);
	});
});
