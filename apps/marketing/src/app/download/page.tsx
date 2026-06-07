import type { Metadata } from "next";
import { DownloadInterstitial } from "./components/DownloadInterstitial";

export const metadata: Metadata = {
	title: "Download Rox",
	description: "Your Rox download is starting.",
	robots: { index: false, follow: true },
};

export default function DownloadPage() {
	return <DownloadInterstitial />;
}
