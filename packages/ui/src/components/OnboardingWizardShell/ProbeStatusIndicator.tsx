"use client";

/**
 * ProbeStatusIndicator — the `/models` probe status badge (F48, #637).
 *
 * Presentational mapping of the shared {@link ProbeStatus} (idle | probing | ok
 * | error) to the spinner / check / error pattern lifted from the desktop
 * onboarding rows. Web + desktop render this; mobile renders its own RN badge
 * over the same neutral status. Localized copy is host-supplied via `labels`.
 */

import type { ProbeStatus } from "@rox/shared/wizard";

import { cn } from "../../lib/utils";
import { DrawnCheck } from "../../motion/DrawnCheck";
import { Spinner } from "../ui/spinner";

export interface ProbeStatusLabels {
	idle: string;
	probing: string;
	ok: string;
	error: string;
}

const DEFAULT_LABELS: ProbeStatusLabels = {
	idle: "Не проверено",
	probing: "Проверка…",
	ok: "Модели получены",
	error: "Ошибка",
};

export interface ProbeStatusIndicatorProps {
	status: ProbeStatus;
	/** Host-supplied localized copy per status. Defaults to RU. */
	labels?: Partial<ProbeStatusLabels>;
	/** On error, the failure reason to surface under the badge. */
	error?: string;
	className?: string;
}

export function ProbeStatusIndicator({
	status,
	labels,
	error,
	className,
}: ProbeStatusIndicatorProps) {
	const copy = { ...DEFAULT_LABELS, ...labels };
	return (
		<div
			className={cn("flex flex-col gap-1", className)}
			data-slot="probe-status"
			data-status={status}
		>
			<span className="flex items-center gap-1.5 text-sm">
				{status === "probing" && (
					<Spinner className="size-3.5 text-muted-foreground" />
				)}
				{status === "ok" && (
					<DrawnCheck className="size-3.5 text-emerald-500" />
				)}
				<span
					className={cn(
						"text-muted-foreground",
						status === "ok" && "text-emerald-500",
						status === "error" && "text-destructive",
					)}
				>
					{copy[status]}
				</span>
			</span>
			{status === "error" && error ? (
				<span className="text-xs text-destructive" data-slot="probe-error">
					{error}
				</span>
			) : null}
		</div>
	);
}
