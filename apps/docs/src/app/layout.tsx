import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import "./global.css";
import { COMPANY } from "@rox/shared/constants";
import { Inter } from "next/font/google";
import { NavigationBar } from "@/app/components/NavigationBar";
import { NavbarProvider } from "@/app/components/NavigationBar/components/NavigationMobile";

const inter = Inter({
	subsets: ["latin"],
});

export const metadata: Metadata = {
	metadataBase: new URL(COMPANY.DOCS_URL),
	title: {
		default: `Документация ${COMPANY.NAME}`,
		template: `%s | Документация ${COMPANY.NAME}`,
	},
	description: `Официальная документация ${COMPANY.NAME} — терминал для кодинг-агентов. Узнайте, как запускать параллельных кодинг-агентов на своей машине.`,
	keywords: [
		`документация ${COMPANY.NAME}`,
		"документация кодинг-агентов",
		"руководство по параллельному запуску",
		"инструменты разработчика",
	],
	authors: [{ name: `Команда ${COMPANY.NAME}` }],
	creator: COMPANY.NAME,
	openGraph: {
		type: "website",
		locale: "ru_RU",
		url: COMPANY.DOCS_URL,
		siteName: `Документация ${COMPANY.NAME}`,
		title: `Документация ${COMPANY.NAME}`,
		description: `Официальная документация ${COMPANY.NAME} — терминал для кодинг-агентов.`,
	},
	twitter: {
		card: "summary_large_image",
		title: `Документация ${COMPANY.NAME}`,
		description: `Официальная документация ${COMPANY.NAME} — терминал для кодинг-агентов.`,
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
};

export default function Layout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang="ru"
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
