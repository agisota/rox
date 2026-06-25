import { PortalHost } from "@rn-primitives/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { ThemeProvider } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { Uniwind } from "uniwind";
import { useSession } from "@/lib/auth/client";
import { NAV_THEME, STATUS_BAR_THEME } from "@/lib/theme";

/** Active color scheme (forced dark for now; one source the chrome reads). */
const ACTIVE_SCHEME = "dark" as const;

Uniwind.setTheme(ACTIVE_SCHEME);

import { QuoteLoadingScreen } from "@/components/appearance/QuoteLoadingScreen";
import { PostHogUserIdentifier } from "./components/PostHogUserIdentifier";
import { AppearanceProvider } from "./providers/AppearanceProvider";
import { PostHogProvider } from "./providers/PostHogProvider";

const queryClient = new QueryClient();

/**
 * Inner tree that can read appearance settings. Renders the motivational quote
 * loading screen (gated on `quoteLoaderEnabled`) while the session is resolving,
 * then the navigation stack once `isPending` clears.
 */
function RootLayoutContent() {
	const { data: session, isPending } = useSession();
	const statusBar = STATUS_BAR_THEME[ACTIVE_SCHEME];

	// Native status-bar chrome tracks the resolved theme (F09), mirroring the web
	// `<meta theme-color>` and desktop glass accent. Rendered in both the loading
	// and main branches so the OS chrome is correct from first paint.
	if (isPending) {
		return (
			<>
				<StatusBar style={statusBar.style} />
				<QuoteLoadingScreen />
			</>
		);
	}

	return (
		<ThemeProvider value={NAV_THEME[ACTIVE_SCHEME]}>
			<StatusBar style={statusBar.style} />
			<Stack screenOptions={{ headerShown: false }}>
				<Stack.Protected guard={!!session}>
					<Stack.Screen name="(authenticated)" />
				</Stack.Protected>
				<Stack.Protected guard={!session}>
					<Stack.Screen name="(auth)" />
				</Stack.Protected>
			</Stack>
			<PostHogUserIdentifier />
			<PortalHost />
		</ThemeProvider>
	);
}

export function RootLayout() {
	return (
		<QueryClientProvider client={queryClient}>
			<AppearanceProvider>
				<PostHogProvider>
					<RootLayoutContent />
				</PostHogProvider>
			</AppearanceProvider>
		</QueryClientProvider>
	);
}
