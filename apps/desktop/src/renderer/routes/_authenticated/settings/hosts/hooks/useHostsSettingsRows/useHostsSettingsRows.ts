import type { SelectV2Host } from "@rox/db/schema";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";
import {
	buildLocalHostFallback,
	mergeHostsWithLocalFallback,
} from "../../lib/localHostFallback";

interface UseHostsSettingsRowsResult {
	hosts: SelectV2Host[];
	isReady: boolean;
}

export function useHostsSettingsRows(): UseHostsSettingsRowsResult {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const {
		activeHostUrl,
		activeOrganizationId: localActiveOrganizationId,
		activeOrganizationName,
		hostServiceStatus,
		machineId,
	} = useLocalHostService();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? localActiveOrganizationId);
	const currentUserId = session?.user?.id ?? null;

	const { data: persistedHosts = [], isReady } = useLiveQuery(
		(q) =>
			q
				.from({ hosts: collections.v2Hosts })
				.where(({ hosts }) =>
					eq(hosts.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ hosts }) => ({ ...hosts })),
		[collections, activeOrganizationId],
	);

	const localFallback = useMemo(
		() =>
			buildLocalHostFallback({
				activeHostUrl,
				activeOrganizationId,
				activeOrganizationName,
				currentUserId,
				hostServiceStatus,
				machineId,
			}),
		[
			activeHostUrl,
			activeOrganizationId,
			activeOrganizationName,
			currentUserId,
			hostServiceStatus,
			machineId,
		],
	);

	const hosts = useMemo(
		() => mergeHostsWithLocalFallback(persistedHosts, localFallback),
		[persistedHosts, localFallback],
	);

	return { hosts, isReady };
}
