import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import "./global.css";
import {
	COMPANY,
	DEFAULT_HTML_LANG,
	DEFAULT_OPEN_GRAPH_LOCALE,
} from "@superset/shared/constants";
import { Inter } from "next/font/google";
import { NavigationBar } from "@/app/components/NavigationBar";
import { NavbarProvider } from "@/app/components/NavigationBar/components/NavigationMobile";

const inter = Inter({
	subsets: ["latin"],
});

export const metadata: Metadata = {
	metadataBase: new URL(COMPANY.DOCS_URL),
	applicationName: COMPANY.NAME,
	title: {
		default: `Документация ${COMPANY.NAME}`,
		template: `%s | Документация ${COMPANY.NAME}`,
	},
	description: `Документация ${COMPANY.NAME}: задачи, рабочие среды, агенты разработки, MCP и самостоятельное размещение.`,
	keywords: [
		`${COMPANY.NAME} документация`,
		"агенты разработки",
		"параллельные задачи",
		"самостоятельное размещение",
	],
	authors: [{ name: `Команда ${COMPANY.NAME}` }],
	creator: COMPANY.NAME,
	openGraph: {
		type: "website",
		locale: DEFAULT_OPEN_GRAPH_LOCALE,
		url: COMPANY.DOCS_URL,
		siteName: `Документация ${COMPANY.NAME}`,
		title: `Документация ${COMPANY.NAME}`,
		description: `Документация ${COMPANY.NAME}: задачи, рабочие среды, агенты разработки, MCP и самостоятельное размещение.`,
	},
	twitter: {
		card: "summary_large_image",
		title: `Документация ${COMPANY.NAME}`,
		description: `Документация ${COMPANY.NAME}: задачи, рабочие среды, агенты разработки, MCP и самостоятельное размещение.`,
		creator: COMPANY.X_HANDLE,
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
};

export default function Layout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang={DEFAULT_HTML_LANG}
			className={`${inter.className} overscroll-none`}
			suppressHydrationWarning
		>
			<body className="flex flex-col min-h-screen overscroll-none">
				<RootProvider>
					<NavbarProvider>
						<NavigationBar />
						{children}
					</NavbarProvider>
				</RootProvider>
			</body>
		</html>
	);
}
