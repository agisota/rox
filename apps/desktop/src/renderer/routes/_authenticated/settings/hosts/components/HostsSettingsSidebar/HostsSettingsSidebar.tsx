import { cn } from "@rox/ui/utils";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";
import {
	type SettingsListGroup,
	SettingsListSidebar,
	settingsListItemClass,
} from "../../../components/SettingsListSidebar";
import { AddHostModal } from "../AddHostModal";

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
	const [addOpen, setAddOpen] = useState(false);

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
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
		const sorted = [...hosts].sort((a, b) => a.name.localeCompare(b.name));
		return [
			{
				id: "online",
				title: "В сети",
				rows: sorted.filter((h) => h.isOnline),
			},
			{
				id: "offline",
				title: "Не в сети",
				rows: sorted.filter((h) => !h.isOnline),
			},
		];
	}, [hosts]);

	return (
		<>
			<AddHostModal open={addOpen} onOpenChange={setAddOpen} />
			<SettingsListSidebar
				searchPlaceholder="Фильтр хостов..."
				searchAriaLabel="Фильтр хостов"
				groups={listGroups}
				listHeader={
					<button
						type="button"
						onClick={() => setAddOpen(true)}
						className={settingsListItemClass(false, "gap-2 w-full")}
					>
						<LuPlus className="size-4 shrink-0" />
						<span className="truncate flex-1 text-left">Добавить хост</span>
					</button>
				}
				filterRow={(row, q) => row.name.toLowerCase().includes(q.toLowerCase())}
				getRowKey={(row) => row.id}
				emptyLabel="Пока нет хостов."
				noMatchLabel={(q) => `Нет хостов по запросу «${q}».`}
				renderRow={(row) => (
					<Link
						to="/settings/hosts/$hostId"
						params={{ hostId: row.id }}
						className={settingsListItemClass(
							row.id === selectedHostId,
							"gap-2",
						)}
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
		</>
	);
}
