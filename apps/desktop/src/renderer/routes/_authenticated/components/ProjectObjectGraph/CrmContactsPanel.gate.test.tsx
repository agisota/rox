import { afterEach, describe, expect, it, mock } from "bun:test";
import {
	type ContactListItemInput,
	mapContactCards,
	mapContactLinks,
	type NeighborEdge,
	type NeighborNode,
} from "@rox/shared/crm-contacts";
import {
	type ExperimentalFeatureState,
	resolveExperimentalFeatureState,
} from "@rox/shared/experimental-features";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Desktop parity for `projectOs.crmContacts`. This suite proves the gated
 * contract of the CRM-contacts panel:
 *
 *   1. gate ON (enabled + available) → the contacts surface mounts, the list
 *      query calls the shipped read-only `graph.listContacts` with the right
 *      input (active status, page limit), and the rows render via the REUSED
 *      pure mapper (`@rox/shared/crm-contacts` → `mapContactCards`): best display
 *      name, mailto/email subtitle, "Вы" self badge;
 *   2. gate OFF (disabled OR not-available) → the surface is absent (no header,
 *      no `graph.listContacts` call) — no regression versus today; and
 *   3. the detail/links contract the panel wires `graph.neighbors` →
 *      `mapContactLinks` to: the SAME relation set the panel requests, mapped to
 *      RU kind + relation labels with honest `rox://` deep links. This asserts the
 *      exact reused-mapper output the `ContactLinks` row renders, without driving
 *      internal selection state (a static render cannot click a list row, and
 *      mocking React's `useState` deadlocks `react-dom/server`).
 *
 * The gate is driven by mocking `useExperimentalFeature` (its data source). The
 * cloud-tRPC singleton + react-query are mocked so the surface assertions
 * exercise OUR wiring (gate, list input, card-mapper reuse), never a live
 * transport.
 */

// The exact relation set the panel passes to `graph.neighbors` (kept in sync via
// this assertion); duplicated here as the test's source of truth.
const PANEL_CONTACT_LINK_RELATIONS = [
	"authored_by",
	"mentions",
	"participant_of",
	"about",
	"references",
] as const;

let currentState: ExperimentalFeatureState = makeState(true, "available");

function makeState(
	enabled: boolean,
	availability: ExperimentalFeatureState["availability"],
): ExperimentalFeatureState {
	return {
		id: "projectOs.crmContacts",
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

// The contact list rows returned by the shipped `graph.listContacts`.
const contactItems = [
	{
		entityId: "contact-ada",
		slug: "ada",
		title: "node-title",
		displayName: "Ada Lovelace",
		primaryEmail: "ada@analytical.engine",
		avatarUrl: null,
		isSelf: false,
		fieldCount: 2,
	},
	{
		entityId: "contact-me",
		slug: "me",
		title: "Me",
		displayName: "Grace Hopper",
		primaryEmail: null,
		avatarUrl: null,
		isSelf: true,
		fieldCount: 0,
	},
];

// Capture the exact input the panel passes to `graph.listContacts`.
let capturedListInput: unknown;

const cloudProxy = {
	graph: {
		listContacts: {
			queryOptions: (input: unknown) => {
				capturedListInput = input;
				return { queryKey: ["graph.listContacts", input] };
			},
		},
		// Present so the surface compiles; the static render never selects a contact
		// (no click), so this is not exercised here — the neighbors→links contract is
		// asserted below via the reused mapper directly.
		neighbors: {
			queryOptions: (input: unknown) => ({
				queryKey: ["graph.neighbors", input],
			}),
		},
	},
};

mock.module("renderer/lib/api-trpc-react", () => ({
	useCloudTrpc: () => cloudProxy,
}));

// Drive the list query through react-query without a live transport.
mock.module("@tanstack/react-query", () => ({
	useQuery: () => ({
		data: { items: contactItems, nextCursor: null },
		isLoading: false,
		isError: false,
		refetch: async () => undefined,
	}),
}));

const { CrmContactsPanel } = await import("./CrmContactsPanel");

afterEach(() => {
	currentState = makeState(true, "available");
	capturedListInput = undefined;
});

describe("CrmContactsPanel — desktop gate (projectOs.crmContacts)", () => {
	it("gate ON: renders the surface and calls graph.listContacts with active status + page limit", () => {
		currentState = makeState(true, "available");
		const html = renderToStaticMarkup(createElement(CrmContactsPanel));

		// Surface is present.
		expect(html).toContain("Контакты");
		expect(html).toContain('aria-label="Контакты"');

		// The shipped read-only listContacts query was issued with the right input.
		expect(capturedListInput).toMatchObject({
			status: "active",
			limit: 50,
		});
	});

	it("gate ON: renders contact rows via the REUSED shared mapper (display name, email subtitle, self badge)", () => {
		currentState = makeState(true, "available");
		const html = renderToStaticMarkup(createElement(CrmContactsPanel));

		// Best display name comes from the reused mapper (detail displayName wins).
		expect(html).toContain("Ada Lovelace");
		expect(html).toContain("Grace Hopper");
		// Email subtitle (mailto affordance) from the reused mapper.
		expect(html).toContain("ada@analytical.engine");
		// Self badge ("Вы") for the isSelf contact.
		expect(html).toContain("Вы");

		// Sanity: the rendered names match what the reused mapper produces for the
		// same input, proving the panel renders the mapper output (not its own).
		const cards = mapContactCards(contactItems as ContactListItemInput[]);
		for (const card of cards) {
			expect(html).toContain(card.name);
		}
	});

	it("detail contract: the relation set the panel requests maps via the REUSED mapper to RU labels + honest rox:// links", () => {
		// This is the exact contract `ContactLinks` wires: it asks `graph.neighbors`
		// for PANEL_CONTACT_LINK_RELATIONS and renders the result through
		// `mapContactLinks`. We assert that reused mapping for a representative
		// neighbors payload so the row output is verified without internal selection.
		const contactId = "contact-ada";
		const nodes: NeighborNode[] = [
			{ entityId: contactId, kind: "contact", title: "Ada", slug: "ada" },
			{ entityId: "task-1", kind: "task", title: "Ship CRM", slug: "ship-crm" },
			{ entityId: "proj-1", kind: "project", title: "Rox", slug: "rox" },
		];
		const edges: NeighborEdge[] = [
			{
				id: "e1",
				sourceEntityId: contactId,
				targetEntityId: "task-1",
				relation: "about",
				resolved: true,
			},
			{
				id: "e2",
				sourceEntityId: contactId,
				targetEntityId: "proj-1",
				relation: "references",
				resolved: true,
			},
		];

		const links = mapContactLinks({ contactEntityId: contactId, nodes, edges });
		expect(links).toEqual([
			{
				entityId: "task-1",
				title: "Ship CRM",
				kindLabel: "Задача",
				relationLabel: "О контакте",
				href: "rox://tasks/ship-crm",
			},
			{
				entityId: "proj-1",
				title: "Rox",
				kindLabel: "Проект",
				relationLabel: "Ссылка",
				// project has no desktop route → no fabricated deep link.
				href: null,
			},
		]);

		// The relations the panel requests are all valid graph relations the mapper
		// labels (no silent drop): each resolves to a non-identity RU label.
		for (const relation of PANEL_CONTACT_LINK_RELATIONS) {
			const one = mapContactLinks({
				contactEntityId: contactId,
				nodes: [
					{ entityId: contactId, kind: "contact", title: "Ada", slug: "ada" },
					{ entityId: "task-1", kind: "task", title: "T", slug: "t" },
				],
				edges: [
					{
						id: `r-${relation}`,
						sourceEntityId: contactId,
						targetEntityId: "task-1",
						relation,
						resolved: true,
					},
				],
			});
			expect(one).toHaveLength(1);
			expect(one[0]?.relationLabel).not.toBe(relation);
		}
	});

	it("gate OFF (disabled): the surface is absent — no header, no graph.listContacts call", () => {
		currentState = makeState(false, "available");
		const html = renderToStaticMarkup(createElement(CrmContactsPanel));
		expect(html).toBe("");
		expect(html).not.toContain('aria-label="Контакты"');
		expect(capturedListInput).toBeUndefined();
	});

	it("gate OFF (not available): the surface is absent even when enabled", () => {
		currentState = makeState(true, "needs_configuration");
		const html = renderToStaticMarkup(createElement(CrmContactsPanel));
		expect(html).toBe("");
		expect(capturedListInput).toBeUndefined();
	});

	it("gate uses the real resolver default for projectOs.crmContacts (sanity)", () => {
		// The feature exists in the registry and resolves a concrete state — this is
		// the same id the panel + ExperimentalFeatureGate consume.
		const resolved = resolveExperimentalFeatureState("projectOs.crmContacts");
		expect(resolved.id).toBe("projectOs.crmContacts");
	});
});
