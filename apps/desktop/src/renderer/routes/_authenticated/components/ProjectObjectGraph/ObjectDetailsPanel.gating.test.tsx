import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ExperimentalFeatureState } from "@rox/shared/experimental-features";
import { renderToStaticMarkup } from "react-dom/server";
import type { ObjectGraphNode } from "./ObjectDetailsPanel";

// Control the resolved gate state for `collaboration.threadsAsObjects` without
// standing up the settings tRPC router.
let currentState: ExperimentalFeatureState = {
	id: "collaboration.threadsAsObjects",
	enabled: true,
	defaultEnabled: true,
	userOverride: null,
	availability: "available",
	dependencies: [],
};

mock.module("renderer/hooks/useExperimentalFeature", () => ({
	useExperimentalFeature: () => ({
		state: currentState,
		isLoading: false,
		refetch: async () => undefined,
	}),
}));

// The comments section (when the gate opens) reaches the cloud graph router via
// tanstack react-query. Stub the proxy + the query hooks so it renders empty
// (no comments) without a live transport.
const cloudProxy = {
	graph: {
		comments: {
			list: {
				queryOptions: (input: unknown) => ({ queryKey: ["comments", input] }),
				queryKey: (input: unknown) => ["comments", input],
			},
			create: {
				mutationOptions: (opts: unknown) => opts,
			},
		},
	},
};

mock.module("renderer/lib/api-trpc-react", () => ({
	useCloudTrpc: () => cloudProxy,
}));

mock.module("@tanstack/react-query", () => ({
	useQuery: () => ({ data: [], isLoading: false }),
	useMutation: () => ({ mutate: () => {}, isPending: false }),
	useQueryClient: () => ({ invalidateQueries: async () => undefined }),
}));

mock.module("renderer/lib/logger", () => ({
	logger: { error: () => {}, warn: () => {}, info: () => {} },
}));

const { ObjectDetailsPanel } = await import("./ObjectDetailsPanel");

const focus: ObjectGraphNode = {
	entityId: "ent-1",
	kind: "task",
	title: "Ship comments",
	slug: null,
	inProject: true,
};

function setState(partial: Partial<ExperimentalFeatureState>) {
	currentState = { ...currentState, ...partial };
}

afterEach(() => {
	currentState = {
		id: "collaboration.threadsAsObjects",
		enabled: true,
		defaultEnabled: true,
		userOverride: null,
		availability: "available",
		dependencies: [],
	};
});

describe("ObjectDetailsPanel — comments section gating (#11)", () => {
	it("renders the COMMENTS section when the experiment is available", () => {
		setState({ enabled: true, availability: "available" });
		const markup = renderToStaticMarkup(
			<ObjectDetailsPanel
				focus={focus}
				nodes={[focus]}
				edges={[]}
				v2ProjectId="proj-1"
			/>,
		);
		// The gated section + its empty-state + compose box are present.
		expect(markup).toContain("Комментарии");
		expect(markup).toContain("Пока нет комментариев. Будьте первым.");
		expect(markup).toContain("Добавить комментарий…");
	});

	it("hides the COMMENTS section when the experiment is not_implemented (stubbed)", () => {
		setState({ enabled: true, availability: "not_implemented" });
		const markup = renderToStaticMarkup(
			<ObjectDetailsPanel focus={focus} nodes={[focus]} edges={[]} />,
		);
		expect(markup).not.toContain("Комментарии");
		expect(markup).not.toContain("Добавить комментарий…");
		// The object details themselves still render.
		expect(markup).toContain("Ship comments");
	});

	it("hides the COMMENTS section when the experiment is disabled", () => {
		setState({ enabled: false, availability: "available" });
		const markup = renderToStaticMarkup(
			<ObjectDetailsPanel focus={focus} nodes={[focus]} edges={[]} />,
		);
		expect(markup).not.toContain("Комментарии");
	});
});
