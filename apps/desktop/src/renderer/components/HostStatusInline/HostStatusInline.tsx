import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import { LuLoaderCircle } from "react-icons/lu";
import { useHostReadiness } from "renderer/hooks/useHostReadiness";
import {
	getHostStatusInlineView,
	type HostStatusDotTone,
} from "./getHostStatusInlineView";

interface HostStatusInlineProps {
	className?: string;
}

const DOT_TONE_CLASS: Record<HostStatusDotTone, string> = {
	ready: "bg-green-500",
	starting: "bg-yellow-500",
	idle: "bg-muted-foreground",
};

/**
 * Inline host-readiness indicator: a status dot + RU label, plus a one-click
 * "Подключить" when the host is down. Drives off the shared
 * `useLocalHostService` source via `useHostReadiness`, so create surfaces can
 * show "Поднимаем хост…" instead of a postfacto unavailable toast.
 *
 * Renders nothing once the host is ready to keep the happy path uncluttered.
 */
export function HostStatusInline({ className }: HostStatusInlineProps) {
	const { hostReady, status, connecting, connect } = useHostReadiness();
	const view = getHostStatusInlineView(status, hostReady, connecting);

	if (view.tone === "ready") return null;

	return (
		<div
			className={cn(
				"flex items-center gap-2 text-xs text-muted-foreground",
				className,
			)}
		>
			{view.showSpinner ? (
				<LuLoaderCircle
					className="size-3 shrink-0 animate-spin text-yellow-500"
					aria-hidden="true"
				/>
			) : (
				<span
					className={cn(
						"size-2 shrink-0 rounded-full",
						DOT_TONE_CLASS[view.tone],
					)}
				/>
			)}
			<span className="select-text">{view.label}</span>
			{view.showConnect && (
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="h-6 px-2 text-[11px]"
					onClick={connect}
					disabled={connecting}
				>
					{connecting ? "Подключение…" : "Подключить"}
				</Button>
			)}
		</div>
	);
}
