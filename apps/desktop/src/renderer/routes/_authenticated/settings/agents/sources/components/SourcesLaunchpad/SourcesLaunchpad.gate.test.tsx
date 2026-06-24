import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { ExperimentalFeatureState } from "@rox/shared/experimental-features";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Desktop parity gate for `agentNative.sourceMarketplace`: the in-desktop Agent
 * Sources management surface must mount ONLY when the experiment resolves usable
 * (enabled AND `available`) and otherwise stay genuinely absent — there is no
 * sources route on the desktop today, so OFF must be a true no-op (no
 * regression). This suite proves the gate-driven MOUNT/ABSENCE plus that the
 * mounted surface drives the EXACT cross-platform `agentSource` CRUD the web
 * surface uses (it must call `agentSource.list` scoped to the active org), NOT a
 * mock.
 *
 * We drive the gate by mocking its data source (`useExperimentalFeature`), the
 * app-internal auth + cloud-tRPC singletons (NOT shared barrels), and the
 * react-query hooks, so the assertion exercises OUR wiring (gate + which tRPC
 * procedure the list calls), never a live transport.
 */

let currentState: ExperimentalFeatureState = makeState("available", true);
let activeOrganizationId: string | null = "org_1";

/** Records the inputs each `agentSource` procedure was invoked with. */
const calls: {
	listQueryOptions: unknown[];
	listQueryKey: unknown[];
	createMutationOptions: number;
	updateMutationOptions: number;
	setStatusMutationOptions: number;
} = {
	listQueryOptions: [],
	listQueryKey: [],
	createMutationOptions: 0,
	updateMutationOptions: 0,
	setStatusMutationOptions: 0,
};

function makeState(
	availability: ExperimentalFeatureState["availability"],
	enabled: boolean,
): ExperimentalFeatureState {
	return {
		id: "agentNative.sourceMarketplace",
		enabled,
		defaultEnabled: true,
		userOverride: null,
		availability,
		dependencies: [],
	};
}

mock.module("renderer/hooks/useExperimentalFeature", () => ({
	useExperimentalFeature: () => ({
		state: currentState,
		isLoading: false,
		refetch: async () => undefined,
	}),
}));

mock.module("renderer/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: { session: { activeOrganizationId } } }),
	},
	getAuthToken: () => null,
}));

// The mounted surface reaches the cloud `agentSource` router via the
// tanstack-react-query options proxy — the SAME `useCloudTrpc` the web feature's
// `useTRPC` resolves to. Record the procedure access + inputs so we can prove the
// surface calls the real `agentSource` procedures (not a mock data path).
const cloudProxy = {
	agentSource: {
		list: {
			queryOptions: (input: unknown) => {
				calls.listQueryOptions.push(input);
				return { queryKey: ["agentSource.list", input] };
			},
			queryKey: (input: unknown) => {
				calls.listQueryKey.push(input);
				return ["agentSource.list", input];
			},
		},
		create: {
			mutationOptions: (opts: unknown) => {
				calls.createMutationOptions += 1;
				return opts;
			},
		},
		update: {
			mutationOptions: (opts: unknown) => {
				calls.updateMutationOptions += 1;
				return opts;
			},
		},
		setStatus: {
			mutationOptions: (opts: unknown) => {
				calls.setStatusMutationOptions += 1;
				return opts;
			},
		},
	},
};

mock.module("renderer/lib/api-trpc-react", () => ({
	useCloudTrpc: () => cloudProxy,
}));

// Render with no rows (empty list) and inert mutations so the surface renders
// deterministically without a live transport.
mock.module("@tanstack/react-query", () => ({
	useQuery: () => ({ data: [], isLoading: false, isError: false }),
	useMutation: () => ({ mutate: () => {}, isPending: false }),
	useQueryClient: () => ({ invalidateQueries: async () => undefined }),
}));

const { SourcesLaunchpad } = await import("./SourcesLaunchpad");

function resetCalls() {
	calls.listQueryOptions = [];
	calls.listQueryKey = [];
	calls.createMutationOptions = 0;
	calls.updateMutationOptions = 0;
	calls.setStatusMutationOptions = 0;
}

beforeEach(() => {
	currentState = makeState("available", true);
	activeOrganizationId = "org_1";
	resetCalls();
});

afterEach(() => {
	mock.restore();
});

const GATE_OFF_TEXT = "недоступно для текущего контекста";
const MANAGER_HEADER = "Источники агентов";

describe("SourcesLaunchpad (desktop sourceMarketplace gate)", () => {
	it("mounts the sources management surface when enabled + available + org-scoped", () => {
		const markup = renderToStaticMarkup(<SourcesLaunchpad />);
		// The management surface header is present...
		expect(markup).toContain(MANAGER_HEADER);
		expect(markup).toContain("Подключить источник");
		// ...and the gate-off fallback is NOT shown.
		expect(markup).not.toContain(GATE_OFF_TEXT);
	});

	it("calls the cross-platform agentSource.list procedure scoped to the active org", () => {
		renderToStaticMarkup(<SourcesLaunchpad />);
		// The list view drives the REAL `agentSource.list` (not a mock), scoped to
		// the active org — the exact procedure the web SourcesManager calls.
		expect(calls.listQueryOptions.length).toBeGreaterThan(0);
		expect(calls.listQueryOptions).toContainEqual({
			organizationId: "org_1",
		});
		// The create/update/setStatus mutation options are wired from the same
		// `agentSource` router (the form + list register them on mount).
		expect(calls.createMutationOptions).toBeGreaterThan(0);
		expect(calls.updateMutationOptions).toBeGreaterThan(0);
		expect(calls.setStatusMutationOptions).toBeGreaterThan(0);
	});

	it("is ABSENT (no regression) when the experiment is disabled via override", () => {
		currentState = makeState("available", false);
		const markup = renderToStaticMarkup(<SourcesLaunchpad />);
		expect(markup).not.toContain(MANAGER_HEADER);
		expect(markup).toContain(GATE_OFF_TEXT);
		// OFF must not touch the cloud router at all.
		expect(calls.listQueryOptions.length).toBe(0);
	});

	it("is ABSENT when availability is needs_configuration", () => {
		currentState = makeState("needs_configuration", true);
		const markup = renderToStaticMarkup(<SourcesLaunchpad />);
		expect(markup).not.toContain(MANAGER_HEADER);
		expect(markup).toContain(GATE_OFF_TEXT);
		expect(calls.listQueryOptions.length).toBe(0);
	});

	it("is ABSENT when stubbed (not_implemented)", () => {
		currentState = makeState("not_implemented", true);
		const markup = renderToStaticMarkup(<SourcesLaunchpad />);
		expect(markup).not.toContain(MANAGER_HEADER);
		expect(calls.listQueryOptions.length).toBe(0);
	});

	it("renders a custom fallback when supplied and the gate is closed", () => {
		currentState = makeState("available", false);
		const markup = renderToStaticMarkup(
			<SourcesLaunchpad fallback={<span>off-marker</span>} />,
		);
		expect(markup).toContain("off-marker");
		expect(markup).not.toContain(MANAGER_HEADER);
	});

	it("shows the no-org notice (not org-less queries) when the gate is open but no org is active", () => {
		activeOrganizationId = null;
		const markup = renderToStaticMarkup(<SourcesLaunchpad />);
		// Gate is open, but the manager refuses to issue org-less CRUD.
		expect(markup).toContain("Выберите организацию");
		expect(markup).not.toContain(MANAGER_HEADER);
		expect(calls.listQueryOptions.length).toBe(0);
	});
});
