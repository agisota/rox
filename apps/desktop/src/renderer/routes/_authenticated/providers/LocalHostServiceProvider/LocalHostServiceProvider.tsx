import { useLiveQuery } from "@tanstack/react-db";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	setClientMachineId,
	setHostServiceSecret,
} from "renderer/lib/host-service-auth";
import type { HostServiceAvailabilityStatus } from "renderer/lib/host-service-unavailable";
import { MOCK_ORG_ID } from "shared/constants";
import { useCollections } from "../CollectionsProvider";

interface LocalHostServiceContextValue {
	machineId: string;
	activeHostUrl: string | null;
	activeOrganizationId: string | null;
	activeOrganizationName: string | null;
	hostServiceStatus: HostServiceAvailabilityStatus;
}

const LocalHostServiceContext =
	createContext<LocalHostServiceContextValue | null>(null);

export function LocalHostServiceProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const { mutate: startHostService } =
		electronTrpc.hostServiceCoordinator.start.useMutation();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const organizationIds = useMemo(
		() => organizations?.map((organization) => organization.id) ?? [],
		[organizations],
	);

	useEffect(() => {
		for (const organizationId of organizationIds) {
			startHostService({ organizationId });
		}
	}, [organizationIds, startHostService]);

	const { data: machineIdData } = electronTrpc.device.getMachineId.useQuery(
		undefined,
		{ staleTime: Number.POSITIVE_INFINITY },
	);

	useEffect(() => {
		if (machineIdData?.machineId) {
			setClientMachineId(machineIdData.machineId);
		}
	}, [machineIdData]);

	const { data: activeConnection } =
		electronTrpc.hostServiceCoordinator.getConnection.useQuery(
			{ organizationId: activeOrganizationId as string },
			{ enabled: !!activeOrganizationId, refetchInterval: 5_000 },
		);

	const { data: processStatus } =
		electronTrpc.hostServiceCoordinator.getProcessStatus.useQuery(
			{ organizationId: activeOrganizationId as string },
			{
				enabled: !!activeOrganizationId,
				refetchInterval: activeConnection?.port ? false : 1_000,
			},
		);

	// Eagerly register this Mac as a host the moment the local host-service is
	// reachable (active connection port), rather than lazily on first workspace
	// create. Reuses the idempotent cloud `host.ensure` mutation (same procedure
	// the server-side `startHostEnsure` calls). Guarded by a ref so it fires at
	// most once per session, and best-effort so a failure never blocks launch.
	const didEagerEnsureRef = useRef(false);
	useEffect(() => {
		if (didEagerEnsureRef.current) return;
		if (!activeOrganizationId) return;
		if (!activeConnection?.port) return;
		const machineId = machineIdData?.machineId;
		const hostName = machineIdData?.hostName;
		if (!machineId || !hostName) return;

		didEagerEnsureRef.current = true;
		apiTrpcClient.host.ensure
			.mutate({
				organizationId: activeOrganizationId,
				machineId,
				name: hostName,
			})
			.catch((err) => {
				// Best-effort: registration is also performed lazily on workspace
				// create, so a transient failure here must not block the app. Allow a
				// retry on a later render.
				didEagerEnsureRef.current = false;
				console.warn(
					"[LocalHostServiceProvider] eager host.ensure failed",
					err,
				);
			});
	}, [activeOrganizationId, activeConnection?.port, machineIdData]);

	const activeOrganizationName = useMemo(
		() =>
			organizations?.find(
				(organization) => organization.id === activeOrganizationId,
			)?.name ?? null,
		[organizations, activeOrganizationId],
	);

	const value = useMemo<LocalHostServiceContextValue | null>(() => {
		if (!machineIdData) return null;
		const machineId = machineIdData.machineId;
		const hostServiceStatus: HostServiceAvailabilityStatus =
			activeConnection?.port != null
				? "running"
				: (processStatus?.status ?? "unknown");

		if (!activeConnection?.port) {
			return {
				machineId,
				activeHostUrl: null,
				activeOrganizationId: activeOrganizationId ?? null,
				activeOrganizationName,
				hostServiceStatus,
			};
		}

		const activeHostUrl = `http://127.0.0.1:${activeConnection.port}`;
		if (activeConnection.secret) {
			setHostServiceSecret(activeHostUrl, activeConnection.secret);
		}

		return {
			machineId,
			activeHostUrl,
			activeOrganizationId: activeOrganizationId ?? null,
			activeOrganizationName,
			hostServiceStatus,
		};
	}, [
		machineIdData,
		activeConnection,
		activeOrganizationId,
		activeOrganizationName,
		processStatus?.status,
	]);

	if (!value) return null;

	return (
		<LocalHostServiceContext.Provider value={value}>
			{children}
		</LocalHostServiceContext.Provider>
	);
}

export function useLocalHostService(): LocalHostServiceContextValue {
	const context = useContext(LocalHostServiceContext);
	if (!context) {
		throw new Error(
			"useLocalHostService must be used within LocalHostServiceProvider",
		);
	}
	return context;
}
