import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { SharesSettings } from "./components/SharesSettings";

export const Route = createFileRoute("/_authenticated/settings/shares/")({
	component: SharesSettingsPage,
});

function SharesSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "shares").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <SharesSettings visibleItems={visibleItems} />;
}
