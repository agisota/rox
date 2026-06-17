"use client";

import { THEME_STORAGE_KEY } from "@rox/shared/constants";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { PostHogUserIdentifier } from "@/components/PostHogUserIdentifier";

import { TRPCReactProvider } from "../trpc/react";
import {
	AppearanceProvider,
	AppearanceWallpaper,
} from "./providers/AppearanceProvider";

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
					<AppearanceProvider>
						<PostHogUserIdentifier />
						<AppearanceWallpaper />
						{children}
						<ReactQueryDevtools initialIsOpen={false} />
					</AppearanceProvider>
				</ThemeProvider>
			</TRPCReactProvider>
		</PostHogProvider>
	);
}
