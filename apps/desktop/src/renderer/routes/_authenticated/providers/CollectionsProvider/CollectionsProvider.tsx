import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { MOCK_ORG_ID } from "shared/constants";
import { getCollections, preloadCollections } from "./collections";

type CollectionsContextType = ReturnType<typeof getCollections> & {
	switchOrganization: (organizationId: string) => Promise<void>;
};

const CollectionsContext = createContext<CollectionsContextType | null>(null);
const MOCK_USER_ID = "mock-user-id";

export function preloadActiveOrganizationCollections(
	activeOrganizationId: string | null | undefined,
	activeUserId: string | null | undefined,
): void {
	if (!activeOrganizationId || !activeUserId) return;
	void preloadCollections(activeOrganizationId, activeUserId).catch((error) => {
		console.error(
			"[collections-provider] Failed to preload active org collections:",
			error,
		);
	});
}

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const [isSwitching, setIsSwitching] = useState(false);
	// Local mock mode pins the org but still isolates personal collections by user
	// when a dev session exists.
	const useMockIdentity = env.SKIP_ENV_VALIDATION || env.E2E_AUTH_BYPASS;
	const activeOrganizationId = useMockIdentity
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;
	const activeUserId = useMockIdentity
		? (session?.user?.id ?? MOCK_USER_ID)
		: session?.user?.id;

	const switchOrganization = useCallback(
		async (organizationId: string) => {
			if (organizationId === activeOrganizationId) return;
			setIsSwitching(true);
			try {
				await authClient.organization.setActive({ organizationId });
				if (activeUserId) {
					await preloadCollections(organizationId, activeUserId);
				}
				await refetchSession();
			} finally {
				setIsSwitching(false);
			}
		},
		[activeOrganizationId, activeUserId, refetchSession],
	);

	useEffect(() => {
		preloadActiveOrganizationCollections(activeOrganizationId, activeUserId);
	}, [activeOrganizationId, activeUserId]);

	const collections = useMemo(
		() =>
			activeOrganizationId && activeUserId
				? getCollections(activeOrganizationId, activeUserId)
				: null,
		[activeOrganizationId, activeUserId],
	);

	const contextValue = useMemo<CollectionsContextType | null>(
		() => (collections ? { ...collections, switchOrganization } : null),
		[collections, switchOrganization],
	);

	if (!contextValue || isSwitching) {
		return null;
	}

	return (
		<CollectionsContext.Provider value={contextValue}>
			{children}
		</CollectionsContext.Provider>
	);
}

export function useCollections(): CollectionsContextType {
	const context = useContext(CollectionsContext);
	if (!context) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	return context;
}
