import type { Metadata } from "next";
import { WorkspaceSettingsNav } from "../components/WorkspaceSettingsNav";
import { MembersSettings } from "./components/MembersSettings";

export const metadata: Metadata = {
	title: "Участники — Rox",
};

/**
 * Members management page (Hermes-borrow F27). Web parity with the desktop
 * organization members panel: list members, change roles, remove, and invite —
 * all over the existing `trpc/organization` procedures + better-auth.
 */
export default function MembersSettingsPage() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-10">
			<header className="mb-8">
				<h1 className="font-medium text-2xl leading-none">Управление</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Организация, участники и команды вашего рабочего пространства.
				</p>
			</header>
			<WorkspaceSettingsNav />
			<MembersSettings />
		</div>
	);
}
