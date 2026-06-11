import type { Metadata } from "next";
import { DownloadInterstitial } from "./components/DownloadInterstitial";

export const metadata: Metadata = {
	title: "Скачать Rox",
	description: "Загрузка Rox начинается.",
	robots: { index: false, follow: true },
};

export default function DownloadPage() {
	return <DownloadInterstitial />;
}
