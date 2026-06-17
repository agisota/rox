import { initSentry } from "./lib/sentry";

initSentry();

import { setMotionPreferenceSource } from "@rox/ui/motion";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDom from "react-dom/client";
import { BootErrorBoundary } from "./components/BootErrorBoundary";
import {
	cleanupBootErrorHandling,
	initBootErrorHandling,
	isBootErrorReported,
	markBootMounted,
	reportBootError,
} from "./lib/boot-errors";
import { persistentHistory } from "./lib/persistent-hash-history";
import { posthog } from "./lib/posthog";
import { electronTrpcClient } from "./lib/trpc-client";
import { electronQueryClient } from "./providers/ElectronTRPCProvider";
import { NotFound } from "./routes/not-found";
import { routeTree } from "./routeTree.gen";
import { useSettings } from "./stores/settings";
import { applyGlass } from "./stores/theme/utils/glass";

import "./globals.css";
import "./styles/bundled-fonts.css";

// Wire the `@rox/ui` motion kit to the desktop settings store. Registered before
// the first render so `useMotionPreference`/`useShouldAnimate` resolve the
// persisted `animationPreference` instead of the kit's `"full"` default.
setMotionPreferenceSource({
	getSnapshot: () => useSettings.getState().animationPreference,
	subscribe: (onStoreChange) => useSettings.subscribe(onStoreChange),
});

const rootElement = document.querySelector("app");
initBootErrorHandling(rootElement);

const router = createRouter({
	routeTree,
	history: persistentHistory,
	defaultPreload: "intent",
	defaultNotFoundComponent: NotFound,
	context: {
		queryClient: electronQueryClient,
	},
});

const unsubscribe = router.subscribe("onResolved", (event) => {
	posthog.capture("$pageview", {
		$current_url: event.toLocation.pathname,
	});
});

// Glass surfaces: the persisted toggle lives in main-process appState and the
// native vibrancy is applied there, but the `.glass` root class + CSS vars are
// renderer-side. Without this boot sync they were only applied while the
// appearance settings screen was mounted.
void electronTrpcClient.window.getAppearance
	.query()
	.then((appearance) => {
		if (appearance) {
			applyGlass({
				enabled: appearance.glassEnabled,
				surfaceOpacity: appearance.windowOpacity,
			});
		}
	})
	.catch((error) => {
		console.warn("[glass] Failed to apply persisted glass settings:", error);
	});

const handleDeepLink = (path: string) => {
	console.log("[deep-link] Navigating to:", path);
	router.navigate({ to: path });
};
const ipcRenderer = window.ipcRenderer as typeof window.ipcRenderer | undefined;
if (ipcRenderer) {
	ipcRenderer.on("deep-link-navigate", handleDeepLink);
} else {
	reportBootError(
		"Renderer preload not available (window.ipcRenderer missing)",
	);
}

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		unsubscribe();
		if (ipcRenderer) {
			ipcRenderer.off("deep-link-navigate", handleDeepLink);
		}
		cleanupBootErrorHandling();
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

if (!rootElement) {
	reportBootError("Missing <app> root element");
} else if (!isBootErrorReported()) {
	ReactDom.createRoot(rootElement).render(
		<BootErrorBoundary
			onError={(error) => reportBootError("Render failed", error)}
		>
			<RouterProvider router={router} />
		</BootErrorBoundary>,
	);
	markBootMounted();
}
