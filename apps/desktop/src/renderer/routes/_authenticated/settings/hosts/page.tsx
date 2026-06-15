import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useHostsSettingsRows } from "./hooks/useHostsSettingsRows";

export const Route = createFileRoute("/_authenticated/settings/hosts/")({
	component: HostsIndexPage,
});

function HostsIndexPage() {
	const navigate = useNavigate();
	const { hosts, isReady } = useHostsSettingsRows();

	const firstHostId = useMemo(() => {
		const sorted = [...hosts].sort((a, b) => a.name.localeCompare(b.name));
		const online = sorted.find((h) => h.isOnline);
		return (online ?? sorted[0])?.machineId ?? null;
	}, [hosts]);

	useEffect(() => {
		if (firstHostId) {
			navigate({
				to: "/settings/hosts/$hostId",
				params: { hostId: firstHostId },
				replace: true,
			});
		}
	}, [firstHostId, navigate]);

	if (hosts.length === 0) {
		if (!isReady) return null;
		return (
			<div className="flex items-center justify-center h-full p-6 text-sm text-muted-foreground">
				Хостов пока нет.
			</div>
		);
	}

	return null;
}
