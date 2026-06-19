import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Label } from "@rox/ui/label";
import { Skeleton } from "@rox/ui/skeleton";
import { LuExternalLink } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search/settings-search";

interface PermissionsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

function StatusBadge({ granted }: { granted: boolean | undefined }) {
	if (granted === true) {
		return <Badge variant="secondary">Разрешено</Badge>;
	}
	if (granted === false) {
		return <Badge variant="outline">Нет доступа</Badge>;
	}
	return <Badge variant="outline">Неизвестно</Badge>;
}

function PermissionRow({
	label,
	description,
	granted,
	onRequest,
}: {
	label: string;
	description: string;
	granted: boolean | undefined;
	onRequest: () => void;
}) {
	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label className="text-sm font-medium">{label}</Label>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			<div className="flex items-center gap-3 shrink-0">
				<StatusBadge granted={granted} />
				<Button variant="outline" size="sm" onClick={onRequest}>
					<LuExternalLink className="h-3.5 w-3.5 mr-1.5" />
					Открыть настройки
				</Button>
			</div>
		</div>
	);
}

function PermissionRowSkeleton() {
	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-1.5">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-64" />
			</div>
			<div className="flex items-center gap-3 shrink-0">
				<Skeleton className="h-5 w-16 rounded-full" />
				<Skeleton className="h-8 w-32" />
			</div>
		</div>
	);
}

/**
 * Automation is request-only: macOS exposes no reliable read API for per-target
 * Apple Events authorization, so instead of status badges we offer a per-target
 * "Запросить доступ" button (which raises the "Rox wants to control X" dialog and
 * registers the row in System Settings ▸ Automation), plus a "request all" and a
 * deep link to the Automation pane.
 */
function AutomationSection() {
	const { data: targets } =
		electronTrpc.permissions.getAutomationTargets.useQuery();
	const requestAll = electronTrpc.permissions.requestAppleEvents.useMutation();
	const requestOne = electronTrpc.permissions.requestAutomation.useMutation();
	const openSettings =
		electronTrpc.permissions.openAutomationSettings.useMutation();

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-6">
				<div className="min-w-0 flex-1 space-y-0.5">
					<Label className="text-sm font-medium">Автоматизация</Label>
					<p className="text-xs text-muted-foreground">
						Разрешите Rox управлять другими приложениями (Apple Events). Каждое
						приложение запрашивается отдельно и появляется в разделе
						«Автоматизация» системных настроек.
					</p>
				</div>
				<div className="flex items-center gap-3 shrink-0">
					<Button
						variant="default"
						size="sm"
						onClick={() => requestAll.mutate()}
						disabled={requestAll.isPending}
					>
						Запросить для всех
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => openSettings.mutate()}
					>
						<LuExternalLink className="h-3.5 w-3.5 mr-1.5" />
						Открыть настройки
					</Button>
				</div>
			</div>

			<div className="rounded-md border divide-y">
				{(targets ?? []).map((target) => (
					<div
						key={target.id}
						className="flex items-center justify-between gap-4 px-3 py-2"
					>
						<span className="text-sm">{target.label}</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() => requestOne.mutate({ bundleId: target.bundleId })}
						>
							Запросить доступ
						</Button>
					</div>
				))}
			</div>
		</div>
	);
}

export function PermissionsSettings({
	visibleItems,
}: PermissionsSettingsProps) {
	const { data: status, isLoading } =
		electronTrpc.permissions.getStatus.useQuery(undefined, {
			refetchInterval: 2000,
		});

	const requestFDA =
		electronTrpc.permissions.requestFullDiskAccess.useMutation();
	const requestA11y =
		electronTrpc.permissions.requestAccessibility.useMutation();
	const requestMicrophone =
		electronTrpc.permissions.requestMicrophone.useMutation();
	const requestScreenRecording =
		electronTrpc.permissions.requestScreenRecording.useMutation();
	const requestLocalNetwork =
		electronTrpc.permissions.requestLocalNetwork.useMutation();

	return (
		<div className="p-6 max-w-4xl w-full mx-auto">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Разрешения</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Выдайте системные разрешения, которые нужны Rox.
				</p>
			</div>

			<div className="space-y-6">
				{isLoading ? (
					<>
						<PermissionRowSkeleton />
						<PermissionRowSkeleton />
						<PermissionRowSkeleton />
					</>
				) : (
					<>
						{isItemVisible(
							SETTING_ITEM_ID.PERMISSIONS_FULL_DISK_ACCESS,
							visibleItems,
						) && (
							<PermissionRow
								label="Полный доступ к диску"
								description="Постоянный доступ к Documents, Downloads, Desktop и iCloud."
								granted={status?.fullDiskAccess}
								onRequest={() => requestFDA.mutate()}
							/>
						)}

						{isItemVisible(
							SETTING_ITEM_ID.PERMISSIONS_ACCESSIBILITY,
							visibleItems,
						) && (
							<PermissionRow
								label="Универсальный доступ"
								description="Отправка нажатий клавиш, управление окнами и другими приложениями."
								granted={status?.accessibility}
								onRequest={() => requestA11y.mutate()}
							/>
						)}

						{isItemVisible(
							SETTING_ITEM_ID.PERMISSIONS_MICROPHONE,
							visibleItems,
						) && (
							<PermissionRow
								label="Микрофон"
								description="Голосовая транскрибация и функции push-to-talk."
								granted={status?.microphone}
								onRequest={() => requestMicrophone.mutate()}
							/>
						)}

						{/* Screen Recording: detectable via Electron; request-only nudge. */}
						{visibleItems == null && (
							<PermissionRow
								label="Запись экрана"
								description="Снимки экрана и запись для агентских и QA-сценариев."
								granted={status?.screenRecording}
								onRequest={() => requestScreenRecording.mutate()}
							/>
						)}

						{isItemVisible(
							SETTING_ITEM_ID.PERMISSIONS_APPLE_EVENTS,
							visibleItems,
						) && <AutomationSection />}

						{isItemVisible(
							SETTING_ITEM_ID.PERMISSIONS_LOCAL_NETWORK,
							visibleItems,
						) && (
							<PermissionRow
								label="Локальная сеть"
								description="Поиск серверов разработки в вашей сети и подключение к ним."
								granted={undefined}
								onRequest={() => requestLocalNetwork.mutate()}
							/>
						)}
					</>
				)}
			</div>
		</div>
	);
}
