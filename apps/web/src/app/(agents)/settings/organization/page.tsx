import type { Metadata } from "next";
import { WorkspaceSettingsNav } from "../components/WorkspaceSettingsNav";
import { OrganizationSettings } from "./components/OrganizationSettings";

export const metadata: Metadata = {
	title: "Организация — Rox",
};

/**
 * Organization settings page (Hermes-borrow F27). Web parity with the desktop
 * organization panel — rename the org (owner-only) over `organization.update`.
 */
export default function OrganizationSettingsPage() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-10">
			<header className="mb-8">
				<h1 className="font-medium text-2xl leading-none">Управление</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Организация, участники и команды вашего рабочего пространства.
				</p>
			</header>
			<WorkspaceSettingsNav />
			<OrganizationSettings />
		</div>
	);
}
