import type { Metadata } from "next";
import { WorkspaceSettingsNav } from "../components/WorkspaceSettingsNav";
import { TeamsSettings } from "./components/TeamsSettings";

export const metadata: Metadata = {
	title: "Команды — Rox",
};

/**
 * Teams management page (Hermes-borrow F27). Web parity with the desktop teams
 * panel: list and create teams over `trpc.team.list` + better-auth.
 */
export default function TeamsSettingsPage() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-10">
			<header className="mb-8">
				<h1 className="font-medium text-2xl leading-none">Управление</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Организация, участники и команды вашего рабочего пространства.
				</p>
			</header>
			<WorkspaceSettingsNav />
			<TeamsSettings />
		</div>
	);
}
