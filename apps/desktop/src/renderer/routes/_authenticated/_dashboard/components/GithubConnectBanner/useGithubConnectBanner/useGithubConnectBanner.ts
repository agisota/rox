import { useEffect, useState } from "react";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useGithubConnectBannerStore } from "renderer/stores/github-connect-banner";

/**
 * Module-level per-session guard. We key it by user id so the banner shows once
 * per *login*: a fresh sign-in (new id, or a re-login after sign-out within the
 * same renderer process) gets a new chance to see it. Lives outside React so it
 * survives banner unmount/remount and route changes within a session.
 */
const shownForUserIds = new Set<string>();

interface UseGithubConnectBannerResult {
	/** Whether the banner should currently be visible. */
	open: boolean;
	/** Dismiss for this session (X button). */
	dismiss: () => void;
	/** Persisted "never show again" flag. */
	neverShow: boolean;
	setNeverShow: (value: boolean) => void;
}

/**
 * Drives the optional post-login "connect GitHub" banner.
 *
 * Show logic — the banner appears at most once per login, and only when:
 *  - the user has finished onboarding (we don't double up with the onboarding
 *    GitHub step), and
 *  - the `gh` CLI is not already installed + authenticated, and
 *  - the user has not permanently opted out via "Больше не показывать".
 */
export function useGithubConnectBanner(): UseGithubConnectBannerResult {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;
	const onboardedAt = session?.user?.onboardedAt ?? null;

	const neverShow = useGithubConnectBannerStore((s) => s.neverShow);
	const setNeverShow = useGithubConnectBannerStore((s) => s.setNeverShow);

	// Only fetch gh status once we have an onboarded user and haven't opted out —
	// no point probing the CLI if the banner can't show anyway.
	const shouldCheckGh = !!userId && !!onboardedAt && !neverShow;
	const { data: ghStatus, isFetching: isFetchingGh } =
		electronTrpc.system.detectGhCli.useQuery(undefined, {
			enabled: shouldCheckGh,
		});
	const ghConnected =
		ghStatus?.installed === true && ghStatus?.authenticated === true;

	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!shouldCheckGh || !userId) return;
		// Wait for a definitive gh status before deciding — avoids a flash.
		if (isFetchingGh || ghStatus === undefined) return;
		if (ghConnected) return;
		if (shownForUserIds.has(userId)) return;

		shownForUserIds.add(userId);
		setOpen(true);
	}, [shouldCheckGh, userId, isFetchingGh, ghStatus, ghConnected]);

	const dismiss = () => setOpen(false);

	return { open, dismiss, neverShow, setNeverShow };
}
