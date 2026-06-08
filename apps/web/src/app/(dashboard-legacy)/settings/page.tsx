import { redirect } from "next/navigation";

// The settings segment only hosts sub-routes (e.g. /settings/billing). Redirect
// a bare /settings visit to billing so it doesn't 404.
export default function SettingsPage() {
	redirect("/settings/billing");
}
