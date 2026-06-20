import { PostHogProvider as PHProvider } from "posthog-js/react";
import type React from "react";
import { useEffect, useState } from "react";
import { initOpenPanel, track } from "renderer/lib/analytics";
import { logger } from "renderer/lib/logger";
import { initPostHog, posthog } from "renderer/lib/posthog";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface PostHogProviderProps {
	children: React.ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
	const [isInitialized, setIsInitialized] = useState(false);

	useEffect(() => {
		let cancelled = false;

		(async () => {
			let deviceId: string | undefined;
			try {
				deviceId = (await electronTrpcClient.device.getMachineId.query())
					.machineId;
			} catch (error) {
				logger.error("[posthog] Failed to resolve device id:", error);
			}

			if (cancelled) return;

			try {
				initPostHog(deviceId);
				initOpenPanel();
				track("desktop_opened");
			} catch (error) {
				logger.error("[posthog] Failed to initialize:", error);
			} finally {
				setIsInitialized(true);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	if (!isInitialized) {
		return null;
	}

	return <PHProvider client={posthog}>{children}</PHProvider>;
}
