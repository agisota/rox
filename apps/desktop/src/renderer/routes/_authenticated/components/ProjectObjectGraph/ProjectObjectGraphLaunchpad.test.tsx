import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ExperimentalFeatureState } from "@rox/shared/experimental-features";
import { renderToStaticMarkup } from "react-dom/server";

// Control the resolved gate state without standing up the settings tRPC router.
let currentState: ExperimentalFeatureState = {
	id: "projectOs.workspaceShell",
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

// The shell (when the gate opens) reaches the cloud graph router via tanstack
// react-query. Stub the proxy + the query hooks so it renders empty (no data)
// without a live transport.
const cloudProxy = {
	graph: {
		projectGraph: {
			queryOptions: (input: unknown) => ({ queryKey: ["projectGraph", input] }),
			queryKey: (input: unknown) => ["projectGraph", input],
		},
		search: {
			queryOptions: (input: unknown) => ({ queryKey: ["search", input] }),
		},
		// The self-gated UnifiedSearch + CrmContacts panels also mount inside the
		// shell when the experiment resolves available (this mock returns the same
		// state for every feature id), so their shipped read-only queries must be
		// stubbed here too — they render empty without a live transport.
		listContacts: {
			queryOptions: (input: unknown) => ({ queryKey: ["listContacts", input] }),
		},
		neighbors: {
			queryOptions: (input: unknown) => ({ queryKey: ["neighbors", input] }),
		},
		link: {
			mutationOptions: (opts: unknown) => opts,
		},
	},
};

mock.module("renderer/lib/api-trpc-react", () => ({
	useCloudTrpc: () => cloudProxy,
}));

mock.module("@tanstack/react-query", () => ({
	useQuery: () => ({ data: undefined, isLoading: false }),
	useMutation: () => ({ mutate: () => {}, isPending: false }),
	useQueryClient: () => ({ invalidateQueries: async () => undefined }),
}));

mock.module("renderer/lib/logger", () => ({
	logger: { error: () => {}, warn: () => {}, info: () => {} },
}));

const { ProjectObjectGraphLaunchpad } = await import(
	"./ProjectObjectGraphLaunchpad"
);

function setState(partial: Partial<ExperimentalFeatureState>) {
	currentState = { ...currentState, ...partial };
}

afterEach(() => {
	currentState = {
		id: "projectOs.workspaceShell",
		enabled: true,
		defaultEnabled: true,
		userOverride: null,
		availability: "available",
		dependencies: [],
	};
});

describe("ProjectObjectGraphLaunchpad gating", () => {
	it("renders the object-graph shell when enabled and available", () => {
		setState({ enabled: true, availability: "available" });
		const markup = renderToStaticMarkup(
			<ProjectObjectGraphLaunchpad v2ProjectId="proj-1" />,
		);
		// The shell renders the master object-graph panel.
		expect(markup).toContain("Объекты проекта");
		expect(markup).toContain("project-object-graph");
	});

	it("hides the surface when the experiment is disabled", () => {
		setState({ enabled: false, availability: "available" });
		const markup = renderToStaticMarkup(
			<ProjectObjectGraphLaunchpad
				v2ProjectId="proj-1"
				fallback={<span>off</span>}
			/>,
		);
		expect(markup).not.toContain("Объекты проекта");
		expect(markup).toContain("off");
	});

	it("hides the surface when availability is needs_configuration", () => {
		setState({ enabled: true, availability: "needs_configuration" });
		const markup = renderToStaticMarkup(
			<ProjectObjectGraphLaunchpad
				v2ProjectId="proj-1"
				fallback={<span>configure</span>}
			/>,
		);
		expect(markup).not.toContain("Объекты проекта");
		expect(markup).toContain("configure");
	});

	it("renders nothing usable when stubbed (not_implemented)", () => {
		setState({ enabled: true, availability: "not_implemented" });
		const markup = renderToStaticMarkup(
			<ProjectObjectGraphLaunchpad v2ProjectId="proj-1" />,
		);
		expect(markup).not.toContain("Объекты проекта");
	});
});
