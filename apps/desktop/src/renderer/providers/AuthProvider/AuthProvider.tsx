import { type ReactNode, useEffect, useState } from "react";
import { env } from "renderer/env.renderer";
import { authClient, setAuthToken, setJwt } from "renderer/lib/auth-client";
import { LOCAL_PLAYWRIGHT_SMOKE_AUTH_TOKEN } from "renderer/lib/e2e-auth-bypass";
import { logger } from "renderer/lib/logger";
import { RoxLogo } from "renderer/routes/sign-in/components/RoxLogo/RoxLogo";
import { electronTrpc } from "../../lib/electron-trpc";

/**
 * When the E2E auth bypass is active (dev builds, or a packaged build started
 * with the local-playwright-smoke scope — see `shared/e2e-auth-bypass`), seed a
 * deterministic token so the canvas e2e/smoke can render the authenticated
 * shell without a real sign-in. This branch is dead code in normal production
 * builds because `env.E2E_AUTH_BYPASS` resolves to `false` there.
 */
function E2EAuthBypassProvider({ children }: { children: ReactNode }) {
	const [isReady, setIsReady] = useState(false);

	useEffect(() => {
		setAuthToken(LOCAL_PLAYWRIGHT_SMOKE_AUTH_TOKEN);
		setJwt(LOCAL_PLAYWRIGHT_SMOKE_AUTH_TOKEN);
		setIsReady(true);
		logger.warn(
			"[AuthProvider] E2E auth bypass active — using deterministic smoke token",
		);
	}, []);

	if (!isReady) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<RoxLogo className="h-8 w-auto" gradient />
			</div>
		);
	}
	return <>{children}</>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
	if (env.E2E_AUTH_BYPASS) {
		return <E2EAuthBypassProvider>{children}</E2EAuthBypassProvider>;
	}
	return <RealAuthProvider>{children}</RealAuthProvider>;
}

function RealAuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const { refetch: refetchSession } = authClient.useSession();

	const { data: storedToken, isSuccess } =
		electronTrpc.auth.getStoredToken.useQuery(undefined, {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

	useEffect(() => {
		if (!isSuccess || isHydrated) return;

		let cancelled = false;

		async function hydrate() {
			if (storedToken?.token && storedToken?.expiresAt) {
				const isExpired = new Date(storedToken.expiresAt) < new Date();
				if (!isExpired) {
					setAuthToken(storedToken.token);
					try {
						await refetchSession();
					} catch (err) {
						logger.warn(
							"[AuthProvider] session refetch failed during hydration",
							err,
						);
					}
					try {
						const res = await authClient.token();
						if (res.data?.token) {
							setJwt(res.data.token);
						}
					} catch (err) {
						logger.warn(
							"[AuthProvider] JWT fetch failed during hydration",
							err,
						);
					}
				}
			}
			if (!cancelled) {
				setIsHydrated(true);
			}
		}

		hydrate();
		return () => {
			cancelled = true;
		};
	}, [storedToken, isSuccess, isHydrated, refetchSession]);

	electronTrpc.auth.onTokenChanged.useSubscription(undefined, {
		onData: async (data) => {
			if (data?.token && data?.expiresAt) {
				setAuthToken(null);
				await authClient.signOut({ fetchOptions: { throw: false } });
				setAuthToken(data.token);
				try {
					await refetchSession();
				} catch (err) {
					logger.warn(
						"[AuthProvider] session refetch failed after token change",
						err,
					);
				}
				setIsHydrated(true);
			} else if (data === null) {
				setAuthToken(null);
				setJwt(null);
				try {
					await refetchSession();
				} catch (err) {
					logger.warn(
						"[AuthProvider] session refetch failed after token cleared",
						err,
					);
				}
			}
		},
	});

	useEffect(() => {
		if (!isHydrated) return;

		const refreshJwt = () =>
			authClient
				.token()
				.then((res) => {
					if (res.data?.token) {
						setJwt(res.data.token);
					}
				})
				.catch((err: unknown) => {
					logger.warn("[AuthProvider] JWT refresh failed", err);
				});

		refreshJwt();
		const interval = setInterval(refreshJwt, 50 * 60 * 1000);
		return () => clearInterval(interval);
	}, [isHydrated]);

	if (!isHydrated) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<RoxLogo className="h-8 w-auto" gradient />
			</div>
		);
	}

	return <>{children}</>;
}
