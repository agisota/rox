import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { ProfileUsageSettings } from "./components/ProfileUsageSettings";

export const Route = createFileRoute("/_authenticated/settings/profile/")({
	component: ProfileSettingsPage,
});

function ProfileSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "profile").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <ProfileUsageSettings visibleItems={visibleItems} />;
}
