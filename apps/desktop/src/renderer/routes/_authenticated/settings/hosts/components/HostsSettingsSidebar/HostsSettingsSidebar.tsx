import { cn } from "@rox/ui/utils";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";
import {
	type SettingsListGroup,
	SettingsListSidebar,
	settingsListItemClass,
} from "../../../components/SettingsListSidebar";

interface HostRow {
	id: string;
	name: string;
	machineId: string;
	isOnline: boolean;
}

interface HostsSettingsSidebarProps {
	selectedHostId: string | null;
}

export function HostsSettingsSidebar({
	selectedHostId,
}: HostsSettingsSidebarProps) {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const { machineId, activeHostUrl } = useLocalHostService();

	const activeOrganizationId = env.LOCAL_ONLY_AUTH
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: hosts = [] } = useLiveQuery(
		(q) =>
			q
				.from({ hosts: collections.v2Hosts })
				.where(({ hosts }) =>
					eq(hosts.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ hosts }) => ({
					id: hosts.machineId,
					name: hosts.name,
					machineId: hosts.machineId,
					isOnline: hosts.isOnline,
				})),
		[collections, activeOrganizationId],
	);

	const listGroups = useMemo<Array<SettingsListGroup<HostRow>>>(() => {
		const rows: HostRow[] = hosts.map((host) => ({
			id: host.id,
			name: host.name,
			machineId: host.machineId,
			isOnline: host.isOnline,
		}));
		if (
			env.LOCAL_ONLY_AUTH &&
			machineId &&
			!rows.some((host) => host.machineId === machineId)
		) {
			rows.push({
				id: machineId,
				name: "This device",
				machineId,
				isOnline: Boolean(activeHostUrl),
			});
		}
		const sorted = rows.sort((a, b) => a.name.localeCompare(b.name));
		return [
			{
				id: "online",
				title: "Online",
				rows: sorted.filter((h) => h.isOnline),
			},
			{
				id: "offline",
				title: "Offline",
				rows: sorted.filter((h) => !h.isOnline),
			},
		];
	}, [activeHostUrl, hosts, machineId]);

	return (
		<SettingsListSidebar
			searchPlaceholder="Filter hosts..."
			searchAriaLabel="Filter hosts"
			groups={listGroups}
			filterRow={(row, q) => row.name.toLowerCase().includes(q.toLowerCase())}
			getRowKey={(row) => row.id}
			emptyLabel="No hosts yet."
			noMatchLabel={(q) => `No hosts match "${q}".`}
			renderRow={(row) => (
				<Link
					to="/settings/hosts/$hostId"
					params={{ hostId: row.id }}
					className={settingsListItemClass(row.id === selectedHostId, "gap-2")}
				>
					<span
						className={cn(
							"h-1.5 w-1.5 rounded-full shrink-0",
							row.isOnline ? "bg-emerald-500" : "bg-muted-foreground/40",
						)}
					/>
					<span className="truncate flex-1">{row.name}</span>
				</Link>
			)}
		/>
	);
}
