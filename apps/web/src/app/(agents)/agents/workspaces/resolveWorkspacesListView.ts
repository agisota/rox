import type { AgentsHostListing } from "../data";
import type { AgentsHostTarget } from "../resolveAgentsHostListing";

/**
 * One row the workspaces/hosts listing renders (WS-B T3). Derived purely from a
 * real {@link AgentsHostTarget} (sourced from `host.list`), so the page never
 * touches the mock workspace shapes for the listing. The detail `href` carries
 * the host id as the `?host=` routing hint the existing
 * `/agents/workspace/[id]` detail already resolves into a live session.
 */
export type WorkspacesListItem = {
	hostId: string;
	name: string;
	online: boolean;
	kind: AgentsHostTarget["kind"];
	kindLabel: string;
	statusLabel: string;
	href: string;
};

/** Russian-localized label for each host kind (cabinet is RU). Exhaustive over
 * the `kind` union so the lookup is always a concrete string. */
export function hostKindLabel(kind: AgentsHostTarget["kind"]): string {
	switch (kind) {
		case "local":
			return "Это устройство";
		case "remote":
			return "Удалённый хост";
		case "sandbox":
			return "Песочница";
	}
}

/**
 * Build the detail link for a host target. The detail route keys off the
 * `?host=` machine id (see `workspace/[workspaceId]/page.tsx#resolveHostAttach`),
 * and we route the listing through the host id as the workspace segment so the
 * live read plane (D6) can attach. Encoded to stay safe for arbitrary ids.
 */
export function buildWorkspaceHref(hostId: string): string {
	const encoded = encodeURIComponent(hostId);
	return `/agents/workspace/${encoded}?host=${encoded}`;
}

/**
 * Pure presenter (WS-B T3). Maps the real host listing into render-ready rows,
 * deriving the detail href, kind label, and online status text. Returns the
 * full view-model so the page component stays declarative and the mapping is
 * unit-testable without rendering or tRPC.
 */
export function resolveWorkspacesListView(listing: AgentsHostListing): {
	items: WorkspacesListItem[];
	isEmpty: boolean;
} {
	const items = listing.targets.map((target) => ({
		hostId: target.hostId,
		name: target.name,
		online: target.online,
		kind: target.kind,
		kindLabel: hostKindLabel(target.kind),
		statusLabel: target.online ? "В сети" : "Не в сети",
		href: buildWorkspaceHref(target.hostId),
	}));

	return { items, isEmpty: items.length === 0 };
}
