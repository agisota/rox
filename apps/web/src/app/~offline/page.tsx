import { OfflineShell } from "@rox/ui/offline-shell";
import type { Metadata } from "next";

/**
 * Offline fallback route (F50, Hermes-borrow #645). The service worker
 * (`sw.ts`) precaches and serves this page when a document navigation fails with
 * no network. It is a static, dependency-free shell — it must render from cache
 * with zero runtime data — so it only mounts the presentational `OfflineShell`
 * from `@rox/ui`.
 */
export const metadata: Metadata = {
	title: "Офлайн — Rox",
};

export default function OfflinePage() {
	return <OfflineShell />;
}
