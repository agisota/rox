/**
 * Pure logic for the first-launch permissions gate.
 *
 * The gate proactively surfaces the macOS permissions that the Разрешения
 * (Permissions) settings page also manages, BEFORE the user starts working —
 * so a fresh install isn't silently missing Full Disk / Accessibility /
 * Microphone access. It reuses the exact same `permissions.getStatus` shape and
 * request mutations as the settings page; this module only decides *when* to
 * show the gate and *which* rows to render.
 */

/** Status returned by `electronTrpc.permissions.getStatus`. */
export interface PermissionStatus {
	fullDiskAccess: boolean;
	accessibility: boolean;
	microphone: boolean;
}

/**
 * Identifiers for the request mutations exposed by the permissions router.
 * Kept in sync with `createPermissionsRouter` so the gate can reuse them.
 */
export type PermissionRequestKey =
	| "requestFullDiskAccess"
	| "requestAccessibility"
	| "requestMicrophone"
	| "requestAppleEvents"
	| "requestLocalNetwork";

/** Keys in {@link PermissionStatus} whose granted state we can actually detect. */
export type DetectablePermissionKey = keyof PermissionStatus;

export interface PermissionGateItem {
	/** Stable id used for React keys and tests. */
	id: string;
	label: string;
	description: string;
	/** The status key, when the permission's granted state is detectable. */
	statusKey?: DetectablePermissionKey;
	/** Mutation to invoke when the user clicks "Открыть настройки". */
	requestKey: PermissionRequestKey;
}

/**
 * The permission rows shown in the gate, mirroring the Разрешения settings
 * page. Order matches the settings page for consistency. Full Disk Access,
 * Accessibility, and Microphone expose a detectable status; Automation and
 * Local Network are request-only (macOS gives no reliable read API), matching
 * the settings page which renders them with an unknown status.
 */
export const PERMISSION_GATE_ITEMS: readonly PermissionGateItem[] = [
	{
		id: "full-disk-access",
		label: "Полный доступ к диску",
		description: "Постоянный доступ к Documents, Downloads, Desktop и iCloud.",
		statusKey: "fullDiskAccess",
		requestKey: "requestFullDiskAccess",
	},
	{
		id: "accessibility",
		label: "Универсальный доступ",
		description:
			"Отправка нажатий клавиш, управление окнами и другими приложениями.",
		statusKey: "accessibility",
		requestKey: "requestAccessibility",
	},
	{
		id: "microphone",
		label: "Микрофон",
		description: "Голосовая транскрибация и функции push-to-talk.",
		statusKey: "microphone",
		requestKey: "requestMicrophone",
	},
	{
		id: "automation",
		label: "Автоматизация",
		description:
			"Запуск команд в терминале и взаимодействие с другими приложениями.",
		requestKey: "requestAppleEvents",
	},
	{
		id: "local-network",
		label: "Локальная сеть",
		description: "Поиск серверов разработки в вашей сети и подключение к ним.",
		requestKey: "requestLocalNetwork",
	},
] as const;

/**
 * Detectable permissions whose absence should trigger the gate. Automation and
 * Local Network are excluded because their granted state can't be read, so we
 * never block on them (that would nag forever).
 */
export const GATING_PERMISSION_KEYS: readonly DetectablePermissionKey[] = [
	"fullDiskAccess",
	"accessibility",
	"microphone",
];

/** True when at least one gating permission is known to be missing. */
export function hasMissingGatingPermission(
	status: PermissionStatus | undefined,
): boolean {
	if (!status) return false;
	return GATING_PERMISSION_KEYS.some((key) => status[key] === false);
}

export interface ShouldShowPermissionsGateArgs {
	/** `process.platform`; the gate is macOS-only. */
	platform: NodeJS.Platform | string;
	/** Latest permission status, or undefined while loading. */
	status: PermissionStatus | undefined;
	/** Whether the user already dismissed the gate (persisted in localStorage). */
	dismissed: boolean;
}

/**
 * Decide whether to show the first-launch permissions gate.
 *
 * Show it only when:
 *  - running on macOS (permissions are macOS-specific),
 *  - the user hasn't dismissed it, and
 *  - at least one detectable key permission is missing.
 *
 * This self-resolves: once Full Disk / Accessibility / Microphone are all
 * granted, the gate stops appearing even without an explicit dismissal, so a
 * properly-permissioned install never sees it.
 */
export function shouldShowPermissionsGate({
	platform,
	status,
	dismissed,
}: ShouldShowPermissionsGateArgs): boolean {
	if (platform !== "darwin") return false;
	if (dismissed) return false;
	return hasMissingGatingPermission(status);
}
