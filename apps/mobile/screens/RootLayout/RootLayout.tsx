import { PortalHost } from "@rn-primitives/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { ThemeProvider } from "expo-router/react-navigation";
import { Uniwind } from "uniwind";
import { useSession } from "@/lib/auth/client";
import { NAV_THEME } from "@/lib/theme";

Uniwind.setTheme("dark");

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

	if (isPending) return <QuoteLoadingScreen />;

	return (
		<ThemeProvider value={NAV_THEME.dark}>
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
