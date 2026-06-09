import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { AccountSettings } from "./components/AccountSettings";

export const Route = createFileRoute("/_authenticated/settings/account/")({
	component: AccountSettingsPage,
});

function AccountSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "account").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return (
		<>
			<AccountSettings visibleItems={visibleItems} />
			{/*
			 * Discreet, easy-to-miss entry to the MONAD preview gallery (/monad).
			 * Intentionally tucked in the bottom-right corner at very low opacity —
			 * not part of the structured settings navigation. Always available.
			 */}
			<Link
				to="/monad"
				title="MONAD · preview alpha"
				aria-label="Open MONAD preview gallery"
				className="fixed right-2 bottom-1.5 z-50 select-none text-[10px] leading-none text-muted-foreground/15 transition-colors hover:text-muted-foreground/60"
			>
				α
			</Link>
		</>
	);
}
