import { describe, expect, it } from "bun:test";
import { buildHostRoutingKey } from "@rox/shared/host-routing";
import type { AgentsHostListing, AgentsHostTarget } from "../data";
import {
	buildWorkspaceHref,
	resolveWorkspacesListView,
} from "./resolveWorkspacesListView";

function makeTarget(
	overrides: Partial<AgentsHostTarget> = {},
): AgentsHostTarget {
	return {
		hostId: "machine-1",
		name: "Desktop",
		online: true,
		kind: "local",
		routingKey: buildHostRoutingKey("org-1", "machine-1"),
		...overrides,
	};
}

describe("buildWorkspaceHref", () => {
	it("routes the host id into the workspace detail with a ?host= hint", () => {
		expect(buildWorkspaceHref("machine-1")).toBe(
			"/agents/workspace/machine-1?host=machine-1",
		);
	});

	it("url-encodes ids that contain unsafe characters", () => {
		expect(buildWorkspaceHref("host/with space")).toBe(
			"/agents/workspace/host%2Fwith%20space?host=host%2Fwith%20space",
		);
	});
});

describe("resolveWorkspacesListView", () => {
	it("maps real host targets to render-ready rows", () => {
		const listing: AgentsHostListing = {
			targets: [makeTarget()],
			useMock: false,
		};

		const { items, isEmpty } = resolveWorkspacesListView(listing);

		expect(isEmpty).toBe(false);
		expect(items).toEqual([
			{
				hostId: "machine-1",
				name: "Desktop",
				online: true,
				kind: "local",
				kindLabel: "Это устройство",
				statusLabel: "В сети",
				href: "/agents/workspace/machine-1?host=machine-1",
			},
		]);
	});

	it("derives the offline status label for hosts that are not online", () => {
		const listing: AgentsHostListing = {
			targets: [makeTarget({ online: false })],
			useMock: false,
		};

		const [item] = resolveWorkspacesListView(listing).items;

		expect(item?.online).toBe(false);
		expect(item?.statusLabel).toBe("Не в сети");
	});

	it("labels each host kind (local/remote/sandbox)", () => {
		const listing: AgentsHostListing = {
			targets: [
				makeTarget({ hostId: "a", kind: "local" }),
				makeTarget({ hostId: "b", kind: "remote" }),
				makeTarget({ hostId: "c", kind: "sandbox" }),
			],
			useMock: false,
		};

		const labels = resolveWorkspacesListView(listing).items.map(
			(item) => item.kindLabel,
		);

		expect(labels).toEqual(["Это устройство", "Удалённый хост", "Песочница"]);
	});

	it("reports an empty listing when the org has no hosts", () => {
		const listing: AgentsHostListing = { targets: [], useMock: true };

		const { items, isEmpty } = resolveWorkspacesListView(listing);

		expect(items).toEqual([]);
		expect(isEmpty).toBe(true);
	});
});
