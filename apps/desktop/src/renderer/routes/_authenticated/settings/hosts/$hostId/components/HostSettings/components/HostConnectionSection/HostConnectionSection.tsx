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
	local: "This device",
	remote: "Persistent remote",
	sandbox: "Ephemeral sandbox",
};

const PROVIDER_LABELS: Record<V2HostProvider, string> = {
	daytona: "Daytona",
	modal: "Modal",
	e2b: "E2B",
	self: "Self-managed",
};

function formatCountdown(msRemaining: number): string {
	if (msRemaining <= 0) return "Expired";
	const totalMinutes = Math.floor(msRemaining / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0) return `${hours}h ${minutes}m remaining`;
	const seconds = Math.floor((msRemaining % 60_000) / 1000);
	return `${minutes}m ${seconds}s remaining`;
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
			<h3 className="text-sm font-medium">Connection</h3>
			<div className="space-y-2 rounded-md border p-3">
				<Row label="Type" value={KIND_LABELS[kind]} />
				{provider && <Row label="Provider" value={PROVIDER_LABELS[provider]} />}
				<Row label="Address" value={address} />
				{expiresAt && (
					<Row
						label="Expires"
						value={formatCountdown(expiresAt.getTime() - now)}
					/>
				)}
			</div>
		</section>
	);
}
