import { toast } from "@rox/ui/sonner";

export type HostServiceAvailabilityStatus =
	| "starting"
	| "running"
	| "stopped"
	| "unknown";

export interface HostServiceUnavailableContext {
	activeOrganizationId?: string | null;
	activeOrganizationName?: string | null;
	hostServiceStatus?: HostServiceAvailabilityStatus | null;
	machineId?: string | null;
}

interface HostServiceUnavailableMessageOptions {
	action?: string;
}

function shortId(id: string): string {
	return id.length > 8 ? id.slice(0, 8) : id;
}

function formatOrganization(context: HostServiceUnavailableContext): string {
	if (context.activeOrganizationName) {
		return `«${context.activeOrganizationName}»`;
	}
	if (context.activeOrganizationId) {
		return `организации ${shortId(context.activeOrganizationId)}`;
	}
	return "активной организации";
}

function formatDevice(context: HostServiceUnavailableContext): string {
	return context.machineId
		? `этом устройстве (${shortId(context.machineId)})`
		: "этом устройстве";
}

function getStatusLabel(status: HostServiceAvailabilityStatus): string {
	switch (status) {
		case "starting":
			return "запускается";
		case "running":
			return "работает";
		case "stopped":
			return "остановлен";
		case "unknown":
			return "неизвестно";
	}
}

function getRecoveryText(status: HostServiceAvailabilityStatus): string {
	switch (status) {
		case "starting":
			return "Повторите через несколько секунд.";
		case "stopped":
			return "Перезапустите хост-сервис через меню Rox в трее, затем повторите.";
		case "running":
			return "Повторите после обновления соединения.";
		case "unknown":
			return "Повторите через несколько секунд; если не помогает — перезапустите Rox.";
	}
}

export function getHostServiceUnavailableMessage(
	context: HostServiceUnavailableContext,
	options: HostServiceUnavailableMessageOptions = {},
): string {
	const prefix = options.action ? `Не удалось ${options.action}: ` : "";

	if (!context.activeOrganizationId) {
		return `${prefix}не выбрана активная организация. Выберите организацию или войдите снова.`;
	}

	const status = context.hostServiceStatus ?? "unknown";
	const organization = formatOrganization(context);
	const device = formatDevice(context);

	return `${prefix}локальный хост-сервис недоступен для ${organization} на ${device}. Статус: ${getStatusLabel(status)}. ${getRecoveryText(status)}`;
}

export function showHostServiceUnavailableToast(
	context: HostServiceUnavailableContext,
	options: HostServiceUnavailableMessageOptions = {},
): void {
	toast.error("Хост-сервис недоступен", {
		description: getHostServiceUnavailableMessage(context, options),
	});
}
