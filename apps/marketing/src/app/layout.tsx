import { COMPANY } from "@rox/shared/constants";
import { GeistPixelGrid, GeistPixelSquare } from "geist/font/pixel";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Micro_5, Pixelify_Sans } from "next/font/google";
import Script from "next/script";

import { CookieConsent } from "@/components/CookieConsent";
import {
	OrganizationJsonLd,
	SoftwareApplicationJsonLd,
	WebsiteJsonLd,
} from "@/components/JsonLd";
import { env } from "@/env";

import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import "./globals.css";
import { Providers } from "./providers";

const ibmPlexMono = IBM_Plex_Mono({
	weight: ["300", "400", "500"],
	subsets: ["latin"],
	variable: "--font-ibm-plex-mono",
	display: "swap",
});

const inter = Inter({
	weight: ["300", "400", "500"],
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
});

const micro5 = Micro_5({
	weight: "400",
	subsets: ["latin"],
	variable: "--font-micro5",
	display: "swap",
});

const pixelifySans = Pixelify_Sans({
	weight: ["400", "500", "600", "700"],
	subsets: ["latin"],
	variable: "--font-pixel",
	display: "swap",
});

const siteDescription =
	"Запускай 10+ кодинг-агентов параллельно на своей машине. Создавай новые задачи, пока текущий агент работает, и быстро переключайся между задачами, когда им нужно твоё внимание.";

export const metadata: Metadata = {
	metadataBase: new URL(COMPANY.MARKETING_URL),
	title: {
		default: `${COMPANY.NAME} - параллельные кодинг-агенты на твоей машине`,
		template: `%s | ${COMPANY.NAME}`,
	},
	description: siteDescription,
	keywords: [
		"coding agents",
		"parallel execution",
		"developer tools",
		"AI coding",
		"git worktrees",
		"code automation",
		"Claude Code",
		"Cursor",
		"Codex",
	],
	authors: [{ name: `${COMPANY.NAME} Team` }],
	creator: COMPANY.NAME,
	// #520: OG/Twitter images are intentionally NOT set here. The branded
	// girl-mark card is produced by the App-Router `opengraph-image.tsx` file
	// convention (premium-black + Victor Mono), which Next injects into the root
	// metadata automatically. Hardcoding `/og-image.png` here would override that
	// generated card with the old static banner.
	openGraph: {
		type: "website",
		locale: "ru_RU",
		url: COMPANY.MARKETING_URL,
		siteName: COMPANY.NAME,
		title: `${COMPANY.NAME} - параллельные кодинг-агенты на твоей машине`,
		description: siteDescription,
	},
	twitter: {
		card: "summary_large_image",
		title: `${COMPANY.NAME} - параллельные кодинг-агенты на твоей машине`,
		description: siteDescription,
		creator: "@rox_sh",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "32x32" },
			{ url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
		],
		apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
	},
	manifest: "/manifest.json",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="ru"
			className={`dark overscroll-none ${ibmPlexMono.variable} ${inter.variable} ${micro5.variable} ${pixelifySans.variable} ${GeistPixelSquare.variable} ${GeistPixelGrid.variable}`}
			suppressHydrationWarning
		>
			<head>
				<OrganizationJsonLd />
				<SoftwareApplicationJsonLd />
				<WebsiteJsonLd />
				{/* Google tag (gtag.js) — Google Ads */}
				<Script
					src="https://www.googletagmanager.com/gtag/js?id=AW-18209336001"
					strategy="afterInteractive"
				/>
				<Script id="google-ads-gtag" strategy="afterInteractive">
					{`
						window.dataLayer = window.dataLayer || [];
						function gtag(){dataLayer.push(arguments);}
						gtag('js', new Date());
						gtag('config', 'AW-18209336001');
					`}
				</Script>
			</head>
			<body className="overscroll-none font-sans">
				<Providers>
					<Header dashboardUrl={env.NEXT_PUBLIC_WEB_URL} />
					{/* Clear the fixed floating-pill navbar on inner pages. Landing removes
					    this offset because its chrome is bottom-locked. */}
					<div className="marketing-page-shell pt-[4.5rem]">{children}</div>
					<Footer />
					<CookieConsent />
				</Providers>
			</body>
		</html>
	);
}
