import { toast } from "@rox/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { HostServiceAvailabilityStatus } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export interface HostReadiness {
	/**
	 * True once the local host-service is reachable (`activeHostUrl !== null`),
	 * i.e. ready to accept project/workspace requests. Gate create actions on
	 * this rather than the raw process status so we never let a request fire
	 * before a port exists.
	 */
	hostReady: boolean;
	/** Current coordinator process/connection status. */
	status: HostServiceAvailabilityStatus;
	/** Whether a manual connect attempt is in flight. */
	connecting: boolean;
	/**
	 * Manually (re)start the local host-service for the active organization.
	 * Mirrors `AddHostModal`'s `handleConnectLocal` so inline status affordances
	 * share one coordinator entrypoint with the settings flow.
	 */
	connect: () => void;
}

/**
 * Shared readiness view over the single `LocalHostServiceProvider` source.
 * Provides the boolean pre-gate (`hostReady`) plus a one-click `connect` so
 * create surfaces can disable their actions and show inline status instead of
 * surfacing a postfacto "host unavailable" toast after the click.
 */
export function useHostReadiness(): HostReadiness {
	const { activeHostUrl, activeOrganizationId, hostServiceStatus } =
		useLocalHostService();
	const startHostService =
		electronTrpc.hostServiceCoordinator.start.useMutation();

	const connect = useCallback(() => {
		if (!activeOrganizationId) {
			toast.error(
				"Нет активной организации. Войдите снова или выберите организацию.",
			);
			return;
		}
		startHostService.mutate(
			{ organizationId: activeOrganizationId },
			{
				onError: (error) =>
					toast.error(
						error instanceof Error
							? error.message
							: "Не удалось подключить это устройство",
					),
			},
		);
	}, [activeOrganizationId, startHostService]);

	return {
		hostReady: activeHostUrl !== null,
		status: hostServiceStatus,
		connecting: startHostService.isPending,
		connect,
	};
}
