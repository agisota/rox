import { cn } from "@rox/ui/utils";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuPlus } from "react-icons/lu";
import {
	type SettingsListGroup,
	SettingsListSidebar,
	settingsListItemClass,
} from "../../../components/SettingsListSidebar";
import { useHostsSettingsRows } from "../../hooks/useHostsSettingsRows";
import { AddHostModal } from "../AddHostModal";

interface HostsSettingsSidebarProps {
	selectedHostId: string | null;
}

export function HostsSettingsSidebar({
	selectedHostId,
}: HostsSettingsSidebarProps) {
	const [addOpen, setAddOpen] = useState(false);
	const { hosts } = useHostsSettingsRows();

	const listGroups = useMemo<
		Array<SettingsListGroup<(typeof hosts)[number]>>
	>(() => {
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
				getRowKey={(row) => row.machineId}
				emptyLabel="Пока нет хостов."
				noMatchLabel={(q) => `Нет хостов по запросу «${q}».`}
				renderRow={(row) => (
					<Link
						to="/settings/hosts/$hostId"
						params={{ hostId: row.machineId }}
						className={settingsListItemClass(
							row.machineId === selectedHostId,
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
