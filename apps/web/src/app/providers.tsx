"use client";

import { THEME_STORAGE_KEY } from "@rox/shared/constants";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { Suspense } from "react";

import { AnalyticsIdentifier } from "@/components/AnalyticsIdentifier";
import { AnalyticsPageView } from "@/components/AnalyticsPageView";
import { PostHogUserIdentifier } from "@/components/PostHogUserIdentifier";
import { I18nProvider } from "@/i18n";

import { TRPCReactProvider } from "../trpc/react";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<PostHogProvider client={posthog}>
			<TRPCReactProvider>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					forcedTheme="dark"
					storageKey={THEME_STORAGE_KEY}
					disableTransitionOnChange
				>
					<I18nProvider>
						<PostHogUserIdentifier />
						<AnalyticsIdentifier />
						<Suspense fallback={null}>
							<AnalyticsPageView />
						</Suspense>
						{children}
						<ReactQueryDevtools initialIsOpen={false} />
					</I18nProvider>
				</ThemeProvider>
			</TRPCReactProvider>
		</PostHogProvider>
	);
}
