import type { Metadata } from "next";
import { IdentitySettings } from "./components/IdentitySettings";

export const metadata: Metadata = {
	title: "Профиль — Rox",
};

/**
 * Identity / "Профиль" settings page (ROX-522 Phase 2.2). Shows the user's
 * connected OAuth accounts (read-only) and the custom-username claim flow. The
 * claim is gated server-side on linked providers; the client mirrors that gate
 * for UX only. Data is fetched client-side via `identity.getMine`.
 */
export default function IdentitySettingsPage() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-10">
			<header className="mb-8">
				<h1 className="font-medium text-2xl leading-none">Профиль</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Привязанные аккаунты и публичное имя пользователя для адреса
					rox.one/@&lt;имя&gt;.
				</p>
			</header>
			<IdentitySettings />
		</div>
	);
}
