import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface GithubConnectBannerState {
	/**
	 * Persisted opt-out. When `true` the post-login "connect GitHub" banner is
	 * never shown again, regardless of session. Set via the banner's
	 * "Больше не показывать" checkbox.
	 */
	neverShow: boolean;
	setNeverShow: (value: boolean) => void;
}

/**
 * Persisted preferences for the optional post-login "connect GitHub" banner.
 *
 * GitHub (the `gh` CLI) is optional in Rox — the app works fully without it —
 * so this banner is a soft nudge rather than a gate. The single persisted flag
 * here is the permanent opt-out; the once-per-login behaviour is layered on top
 * by `useGithubConnectBanner` using a module-level per-session flag.
 */
export const useGithubConnectBannerStore = create<GithubConnectBannerState>()(
	devtools(
		persist(
			(set) => ({
				neverShow: false,
				setNeverShow: (value) => set({ neverShow: value }),
			}),
			{ name: "github-connect-banner-v1" },
		),
		{ name: "GithubConnectBanner" },
	),
);
