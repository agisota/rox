import { createFileRoute } from "@tanstack/react-router";
import { NetworkFilterSettings } from "./components/NetworkFilterSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/network-filter/",
)({
	component: NetworkFilterSettingsPage,
});

function NetworkFilterSettingsPage() {
	return <NetworkFilterSettings />;
}
