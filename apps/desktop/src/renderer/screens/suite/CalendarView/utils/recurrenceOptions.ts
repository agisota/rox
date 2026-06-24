/**
 * Recurrence presets for the event dialog. Maps a small set of UI choices to an
 * RFC 5545 RRULE body (using the shared rrule builder so the calendar speaks the
 * same dialect as the automation scheduler), and recognises an existing rule so
 * editing an event preselects the right preset (or "custom" for anything else).
 *
 * Ported from the web calendar verbatim — shares `@rox/shared/rrule` so the
 * desktop and web speak the identical recurrence dialect against one backend.
 */

import { buildRrule, matchPreset } from "@rox/shared/rrule";

export type RecurrencePreset =
	| "none"
	| "daily"
	| "weekdays"
	| "weekly"
	| "custom";

export interface RecurrenceOption {
	value: RecurrencePreset;
	label: string;
}

export const RECURRENCE_OPTIONS: RecurrenceOption[] = [
	{ value: "none", label: "Не повторять" },
	{ value: "daily", label: "Ежедневно" },
	{ value: "weekdays", label: "По будням" },
	{ value: "weekly", label: "Еженедельно" },
	{ value: "custom", label: "Своё правило (RRULE)" },
];

/** Build the RRULE body for a preset, anchored at `dtstart`'s wall-clock time. */
export function presetToRrule(
	preset: RecurrencePreset,
	dtstart: Date,
	customRrule: string,
): string | null {
	const hour = dtstart.getUTCHours();
	const minute = dtstart.getUTCMinutes();
	switch (preset) {
		case "none":
			return null;
		case "daily":
			return buildRrule({ kind: "daily", hour, minute });
		case "weekdays":
			return buildRrule({ kind: "weekdays", hour, minute });
		case "weekly": {
			const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
			const day = days[dtstart.getUTCDay()] ?? "MO";
			return buildRrule({ kind: "weekly", day, hour, minute });
		}
		case "custom":
			return customRrule.trim() || null;
	}
}

/** Recognise the preset an existing RRULE body matches (for edit prefill). */
export function rruleToPreset(rrule: string | null): RecurrencePreset {
	if (!rrule) return "none";
	const match = matchPreset(rrule);
	switch (match.kind) {
		case "daily":
			return "daily";
		case "weekdays":
			return "weekdays";
		case "weekly":
			return "weekly";
		default:
			return "custom";
	}
}
