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
	const requestAppleEvents =
		electronTrpc.permissions.requestAppleEvents.useMutation();
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

						{isItemVisible(
							SETTING_ITEM_ID.PERMISSIONS_APPLE_EVENTS,
							visibleItems,
						) && (
							<PermissionRow
								label="Автоматизация"
								description="Запуск команд в терминале и взаимодействие с другими приложениями."
								granted={undefined}
								onRequest={() => requestAppleEvents.mutate()}
							/>
						)}

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
