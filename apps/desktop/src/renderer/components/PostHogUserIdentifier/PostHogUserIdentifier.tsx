import { useEffect } from "react";
import { identify, track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "../../lib/posthog";

const AUTH_COMPLETED_KEY = "rox_auth_completed";
const ACTIVE_ORG_ID_KEY = "active_organization_id";

export function PostHogUserIdentifier() {
	const { data: session } = authClient.useSession();
	const user = session?.user;
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const { mutate: setUserId } = electronTrpc.analytics.setUserId.useMutation();

	useEffect(() => {
		// Only identify on sign-in. Do NOT reactively reset the PostHog
		// identity on a signed-out/empty session — that fires on initial
		// anonymous load and on token rotation, which breaks anon→identified
		// stitching (#5207). The identity reset now happens exactly once, on
		// user-initiated sign-out, inside useSignOut().
		if (user) {
			posthog.identify(user.id, {
				email: user.email,
				name: user.name,
				desktop_version: window.App.appVersion,
			});
			// Mirror identity into OpenPanel (PII redacted inside the shared client).
			identify(user.id, {
				email: user.email,
				name: user.name,
				desktop_version: window.App.appVersion,
			});
			posthog.reloadFeatureFlags();
			setUserId({ userId: user.id });

			const trackedUserId = localStorage.getItem(AUTH_COMPLETED_KEY);
			if (trackedUserId !== user.id) {
				track("auth_completed");
				localStorage.setItem(AUTH_COMPLETED_KEY, user.id);
			}
		}
	}, [user, setUserId]);

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
