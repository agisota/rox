import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import { DriveBrowser } from "./components/DriveBrowser";
import { QuotaBar } from "./components/QuotaBar";
import { SharesPanel } from "./components/SharesPanel";

export const metadata = {
	title: "Диск — Rox",
};

/**
 * Drive home: quota meter, the file/folder browser (with upload + per-item
 * actions), and the active public shares panel. The interactive pieces are
 * client components that read from the `drive` tRPC router (cache-first).
 */
export default function DrivePage() {
	return (
		<div className="space-y-8">
			<div>
				<h1 className="font-semibold text-2xl">Диск</h1>
				<p className="text-muted-foreground text-sm">
					Ваши файлы и папки. 10 ГиБ на аккаунт.
				</p>
			</div>

			<QuotaBar />

			<DriveBrowser />

			<Card>
				<CardHeader>
					<CardTitle>Публичные ссылки</CardTitle>
					<CardDescription>
						Активные ссылки на файлы и папки. Отзовите, чтобы закрыть доступ.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<SharesPanel />
				</CardContent>
			</Card>
		</div>
	);
}
