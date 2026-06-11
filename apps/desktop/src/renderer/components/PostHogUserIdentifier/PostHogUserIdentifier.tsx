import { createSignInCompletedEvent } from "@rox/analytics";
import { useEffect } from "react";
import {
	identifyAnalyticsUser,
	reloadAnalyticsFeatureFlags,
	resetAnalytics,
	track,
	trackEvent,
} from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";

const AUTH_COMPLETED_KEY = "rox_auth_completed";
const ACTIVE_ORG_ID_KEY = "active_organization_id";

export function PostHogUserIdentifier() {
	const { data: session } = authClient.useSession();
	const user = session?.user;
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const { mutate: setUserId } = electronTrpc.analytics.setUserId.useMutation();

	useEffect(() => {
		if (user) {
			identifyAnalyticsUser(user.id, {
				desktop_version: window.App.appVersion,
			});
			reloadAnalyticsFeatureFlags();
			setUserId({ userId: user.id });

			const trackedUserId = localStorage.getItem(AUTH_COMPLETED_KEY);
			if (trackedUserId !== user.id) {
				track("auth_completed");
				trackEvent(
					createSignInCompletedEvent({
						userId: user.id,
						organizationId: activeOrganizationId,
					}),
				);
				localStorage.setItem(AUTH_COMPLETED_KEY, user.id);
			}
		} else if (session !== undefined && !user) {
			// Session loaded but no user - user is signed out
			resetAnalytics();
			setUserId({ userId: null });
			localStorage.removeItem(AUTH_COMPLETED_KEY);
			localStorage.removeItem(ACTIVE_ORG_ID_KEY);
		}
	}, [user, session, activeOrganizationId, setUserId]);

	useEffect(() => {
		if (session === undefined) return;

		if (activeOrganizationId) {
			localStorage.setItem(ACTIVE_ORG_ID_KEY, activeOrganizationId);
		} else {
			localStorage.removeItem(ACTIVE_ORG_ID_KEY);
		}
	}, [session, activeOrganizationId]);

	return null;
}
