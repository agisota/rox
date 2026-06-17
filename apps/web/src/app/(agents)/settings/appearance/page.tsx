import type { Metadata } from "next";
import { AppearanceSettingsForm } from "./components/AppearanceSettingsForm";

export const metadata: Metadata = {
	title: "Внешний вид — Rox",
};

/**
 * Appearance settings page (custom-loading-screens epic). Local-only controls
 * for wallpaper, glass theme, and the quote loading screen. State is persisted
 * to localStorage by the AppearanceProvider — no account sync on web.
 */
export default function AppearanceSettingsPage() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-10">
			<header className="mb-8">
				<h1 className="font-medium text-2xl leading-none">Внешний вид</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Настройте обои, стеклянную тему и экран ожидания. Настройки
					сохраняются локально в этом браузере.
				</p>
			</header>
			<AppearanceSettingsForm />
		</div>
	);
}
