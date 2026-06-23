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
import { logger } from "renderer/lib/logger";
import { MOCK_ORG_ID } from "shared/constants";
import { useCollections } from "../CollectionsProvider";
import {
	computeHostStartRetry,
	type HostStartRetryState,
	MAX_HOST_START_ATTEMPTS,
} from "./computeHostStartRetry";

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
		electronTrpc.hostServiceCoordinator.start.useMutation({
			onError: (error) => {
				// Don't swallow: a failed auto-start is the root cause behind the
				// "host unavailable" toast users hit later. Surface it for diagnosis;
				// the backoff retry below handles recovery.
				console.error("[LocalHostService] startHostService failed", error);
			},
		});

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	// The coordinator's `start` reads the auth token from the main process, which
	// is only populated once AuthProvider has hydrated the session. Gate auto-start
	// on a present session so we don't fire (and fail) before the token is written
	// — the race that left a freshly-installed app stuck on "host stopped".
	const hasSession = env.SKIP_ENV_VALIDATION ? true : session != null;

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const organizationIds = useMemo(
		() => organizations?.map((organization) => organization.id) ?? [],
		[organizations],
	);

	useEffect(() => {
		if (!hasSession) return;
		for (const organizationId of organizationIds) {
			startHostService({ organizationId });
		}
	}, [hasSession, organizationIds, startHostService]);

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

	// Auto-retry the host start with exponential backoff while the active org's
	// host stays down. A self-rescheduling timer drives re-evaluation so the
	// backoff windows actually elapse — a status-derived effect alone wouldn't
	// re-run while the status string stays a constant "stopped", capping recovery
	// at a single attempt. Closes the "token written late after install" and
	// "host crashed on first start" gaps without a postfacto toast. The loop stops
	// once the host is ready or the attempt budget is spent; manual recovery then
	// falls to HostStatusInline's connect.
	const hostReady = activeConnection?.port != null;
	const activeHostStatus: HostServiceAvailabilityStatus = hostReady
		? "running"
		: (processStatus?.status ?? "unknown");
	const startRetryRef = useRef<HostStartRetryState>({
		attempts: 0,
		lastAttemptAt: null,
	});
	useEffect(() => {
		if (!activeOrganizationId) return;
		// Host is up — reset the budget so a future crash gets fresh retries.
		if (hostReady) {
			startRetryRef.current = { attempts: 0, lastAttemptAt: null };
			return;
		}

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;

		const evaluate = () => {
			if (cancelled) return;
			const decision = computeHostStartRetry({
				canStart: hasSession,
				hostReady,
				status: activeHostStatus,
				state: startRetryRef.current,
				now: Date.now(),
			});
			startRetryRef.current = decision.nextState;
			if (decision.shouldStart) {
				startHostService({ organizationId: activeOrganizationId });
			}
			// Keep re-evaluating (so backoff windows elapse) until the budget is
			// spent; a status change also re-runs the whole effect with fresh values.
			if (hasSession && decision.nextState.attempts < MAX_HOST_START_ATTEMPTS) {
				timer = setTimeout(evaluate, 1_000);
			}
		};
		evaluate();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [
		activeOrganizationId,
		hasSession,
		hostReady,
		activeHostStatus,
		startHostService,
	]);

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
				logger.warn("[LocalHostServiceProvider] eager host.ensure failed", err);
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
		const hostServiceStatus = activeHostStatus;

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
		activeHostStatus,
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
