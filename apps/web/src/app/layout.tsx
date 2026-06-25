import { Toaster } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";

import "./globals.css";

import { Providers } from "./providers";

const ibmPlexMono = IBM_Plex_Mono({
	weight: ["300", "400", "500"],
	subsets: ["latin"],
	variable: "--font-ibm-plex-mono",
});

const inter = Inter({
	weight: ["300", "400", "500"],
	subsets: ["latin"],
	variable: "--font-inter",
});

export const metadata: Metadata = {
	title: "Rox",
	description:
		"Запускайте 10+ параллельных агентов для разработки на своём компьютере",
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "32x32" },
			{ url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
		],
	},
};

// Static SSR / first-paint fallback only (F06). Once the client mounts,
// `AppearanceProvider` drives a dynamic `<meta name="theme-color">` from the
// resolved theme/skin + workspace accent (F09), so the OS chrome tracks runtime
// theme changes. Dark first to match the forced-dark first paint.
export const viewport: Viewport = {
	viewportFit: "cover",
	themeColor: [
		{ media: "(prefers-color-scheme: dark)", color: "black" },
		{ media: "(prefers-color-scheme: light)", color: "white" },
	],
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="ru" suppressHydrationWarning>
			<body
				className={cn(
					"bg-background text-foreground min-h-screen font-sans antialiased",
					inter.variable,
					ibmPlexMono.variable,
				)}
			>
				<Providers>
					{children}
					<Toaster />
				</Providers>
			</body>
		</html>
	);
}
