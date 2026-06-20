import type { Metadata } from "next";
import { DownloadInterstitial } from "./components/DownloadInterstitial";

export const metadata: Metadata = {
	title: "Скачать Rox",
	description: "Загрузка Rox начинается.",
	robots: { index: false, follow: true },
};

interface DownloadPageProps {
	searchParams: Promise<{ os?: string | string[] }>;
}

export default async function DownloadPage({
	searchParams,
}: DownloadPageProps) {
	const { os } = await searchParams;
	return <DownloadInterstitial os={typeof os === "string" ? os : undefined} />;
}
