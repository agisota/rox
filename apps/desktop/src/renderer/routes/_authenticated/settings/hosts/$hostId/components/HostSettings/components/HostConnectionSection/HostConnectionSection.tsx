import type { V2HostKind, V2HostProvider } from "@rox/db/enums";
import { useEffect, useState } from "react";

interface HostConnectionSectionProps {
	kind: V2HostKind;
	provider: V2HostProvider | null;
	port: number | null;
	protocol: string | null;
	expiresAt: Date | null;
}

const KIND_LABELS: Record<V2HostKind, string> = {
	local: "Это устройство",
	remote: "Постоянный удаленный хост",
	sandbox: "Временная песочница",
};

const PROVIDER_LABELS: Record<V2HostProvider, string> = {
	daytona: "Daytona",
	modal: "Modal",
	e2b: "E2B",
	self: "Самостоятельное управление",
};

function formatCountdown(msRemaining: number): string {
	if (msRemaining <= 0) return "Срок истек";
	const totalMinutes = Math.floor(msRemaining / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0) return `Осталось ${hours} ч ${minutes} мин`;
	const seconds = Math.floor((msRemaining % 60_000) / 1000);
	return `Осталось ${minutes} мин ${seconds} с`;
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-4 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-mono">{value}</span>
		</div>
	);
}

export function HostConnectionSection({
	kind,
	provider,
	port,
	protocol,
	expiresAt,
}: HostConnectionSectionProps) {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (!expiresAt) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [expiresAt]);

	// Local "this device" hosts have no managed connection metadata to show.
	if (kind === "local") return null;

	const address = port != null ? `${protocol ?? "tcp"}:${port}` : "—";

	return (
		<section className="space-y-3">
			<h3 className="text-sm font-medium">Подключение</h3>
			<div className="space-y-2 rounded-md border p-3">
				<Row label="Тип" value={KIND_LABELS[kind]} />
				{provider && (
					<Row label="Провайдер" value={PROVIDER_LABELS[provider]} />
				)}
				<Row label="Адрес" value={address} />
				{expiresAt && (
					<Row
						label="Истекает"
						value={formatCountdown(expiresAt.getTime() - now)}
					/>
				)}
			</div>
		</section>
	);
}
