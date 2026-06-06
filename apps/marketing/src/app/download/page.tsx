import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { DownloadInterstitial } from "./components/DownloadInterstitial";

export const metadata: Metadata = {
	title: `Скачать ${COMPANY.NAME}`,
	description: `Загрузка ${COMPANY.NAME} начинается.`,
	robots: { index: false, follow: true },
};

export default function DownloadPage() {
	return <DownloadInterstitial />;
}
