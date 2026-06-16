import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@rox/ui/alert-dialog";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Label } from "@rox/ui/label";
import { useMemo, useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	PERMISSION_GATE_ITEMS,
	type PermissionGateItem,
	type PermissionRequestKey,
	shouldShowPermissionsGate,
} from "./permissionsGate";

const DISMISSED_STORAGE_KEY = "rox.first-launch-permissions-gate.dismissed";
const STATUS_REFETCH_MS = 2_000;

function readDismissed(): boolean {
	try {
		return window.localStorage.getItem(DISMISSED_STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

function saveDismissed(): void {
	try {
		window.localStorage.setItem(DISMISSED_STORAGE_KEY, "true");
	} catch {
		// Best effort; the in-memory state still hides the gate for this session.
	}
}

/**
 * macOS reports `navigator.platform` as "MacIntel"/"MacARM"; normalize to the
 * canonical "darwin" token the pure gate logic expects.
 */
function getPlatform(): string {
	try {
		return navigator.platform.toLowerCase().includes("mac")
			? "darwin"
			: navigator.platform;
	} catch {
		return "unknown";
	}
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

function GatePermissionRow({
	item,
	granted,
	onRequest,
}: {
	item: PermissionGateItem;
	granted: boolean | undefined;
	onRequest: (key: PermissionRequestKey) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label className="text-sm font-medium">{item.label}</Label>
				<p className="text-xs text-muted-foreground">{item.description}</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<StatusBadge granted={granted} />
				<Button
					variant="outline"
					size="sm"
					onClick={() => onRequest(item.requestKey)}
				>
					<LuExternalLink className="mr-1.5 h-3.5 w-3.5" />
					Открыть настройки
				</Button>
			</div>
		</div>
	);
}

/**
 * First-launch permissions gate.
 *
 * Rendered globally inside the authenticated layout. On macOS it proactively
 * surfaces the same permissions managed by Settings → "Разрешения" whenever a
 * detectable key permission (Full Disk / Accessibility / Microphone) is
 * missing, so the user grants them before working. Reuses the existing
 * `permissions.getStatus` query and `request*` mutations; the gate auto-closes
 * once everything is granted, and "Продолжить" dismisses it permanently so the
 * user is never trapped.
 */
export function FirstLaunchPermissionsGate() {
	const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());

	const { data: status } = electronTrpc.permissions.getStatus.useQuery(
		undefined,
		{
			// Keep polling so granting access in System Settings closes the gate.
			refetchInterval: STATUS_REFETCH_MS,
			refetchOnWindowFocus: true,
		},
	);

	const requestFullDiskAccess =
		electronTrpc.permissions.requestFullDiskAccess.useMutation();
	const requestAccessibility =
		electronTrpc.permissions.requestAccessibility.useMutation();
	const requestMicrophone =
		electronTrpc.permissions.requestMicrophone.useMutation();
	const requestAppleEvents =
		electronTrpc.permissions.requestAppleEvents.useMutation();
	const requestLocalNetwork =
		electronTrpc.permissions.requestLocalNetwork.useMutation();

	const requestByKey = useMemo(
		(): Record<PermissionRequestKey, () => void> => ({
			requestFullDiskAccess: () => requestFullDiskAccess.mutate(),
			requestAccessibility: () => requestAccessibility.mutate(),
			requestMicrophone: () => requestMicrophone.mutate(),
			requestAppleEvents: () => requestAppleEvents.mutate(),
			requestLocalNetwork: () => requestLocalNetwork.mutate(),
		}),
		[
			requestFullDiskAccess,
			requestAccessibility,
			requestMicrophone,
			requestAppleEvents,
			requestLocalNetwork,
		],
	);

	const handleRequest = (key: PermissionRequestKey) => {
		requestByKey[key]();
	};

	const handleDismiss = () => {
		setDismissed(true);
		saveDismissed();
	};

	const open = shouldShowPermissionsGate({
		platform: getPlatform(),
		status,
		dismissed,
	});

	const statusForKey = (item: PermissionGateItem): boolean | undefined => {
		const statusKey = item.statusKey;
		if (!statusKey) return undefined;
		return status?.[statusKey];
	};

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (!next) handleDismiss();
			}}
		>
			<AlertDialogContent className="max-w-[560px] gap-0 p-0">
				<AlertDialogHeader className="px-5 pt-5 pb-2">
					<AlertDialogTitle className="font-medium">
						Выдайте разрешения для Rox
					</AlertDialogTitle>
					<AlertDialogDescription className="text-muted-foreground">
						Чтобы Rox работал корректно, выдайте системные разрешения macOS. Вы
						можете сделать это позже в Настройки → «Разрешения».
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="space-y-4 px-5 py-3">
					{PERMISSION_GATE_ITEMS.map((item) => (
						<GatePermissionRow
							key={item.id}
							item={item}
							granted={statusForKey(item)}
							onRequest={handleRequest}
						/>
					))}
				</div>

				<AlertDialogFooter className="flex-row justify-end gap-2 px-5 pb-5 pt-2">
					<Button variant="ghost" size="sm" onClick={handleDismiss}>
						Продолжить
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
