"use client";

import { THEME_STORAGE_KEY } from "@rox/shared/constants";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { PostHogUserIdentifier } from "@/components/PostHogUserIdentifier";

import { TRPCReactProvider } from "../trpc/react";
import { WebCommandPaletteHost } from "./commandPalette/CommandPaletteHost";
import {
	AppearanceProvider,
	AppearanceWallpaper,
} from "./providers/AppearanceProvider";
import { SkinProvider } from "./providers/SkinProvider";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<PostHogProvider client={posthog}>
			<TRPCReactProvider>
				{/*
				 * Theme axis (F08): System/Dark/Light via next-themes. The forced
				 * dark mock is gone — `enableSystem` lets the OS preference drive the
				 * default while users can still pick Dark/Light explicitly. The Skin
				 * axis (named Zed-derived palettes) is owned orthogonally by
				 * SkinProvider below, so theme and skin switch independently.
				 */}
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					storageKey={THEME_STORAGE_KEY}
					disableTransitionOnChange
				>
					<SkinProvider>
						<AppearanceProvider>
							<PostHogUserIdentifier />
							<AppearanceWallpaper />
							{children}
							<WebCommandPaletteHost />
							<ReactQueryDevtools initialIsOpen={false} />
						</AppearanceProvider>
					</SkinProvider>
				</ThemeProvider>
			</TRPCReactProvider>
		</PostHogProvider>
	);
}
