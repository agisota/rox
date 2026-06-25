/**
 * Cross-platform core for the calendar settings popover (rename / delete /
 * share). Role values mirror the DB `cal_share_role` enum and the tRPC
 * `shareCalendar` input; the labels/options are consumed by the web, desktop and
 * mobile share forms so the role copy stays in lockstep across surfaces.
 */

/** ACL roles a calendar can be shared with, in ascending privilege order. */
export const CALENDAR_SHARE_ROLES = ["reader", "writer", "owner"] as const;

export type CalendarShareRole = (typeof CALENDAR_SHARE_ROLES)[number];

/** Russian display label for each share role. */
export const CALENDAR_SHARE_ROLE_LABELS: Record<CalendarShareRole, string> = {
	reader: "Чтение",
	writer: "Редактирование",
	owner: "Владелец",
};

/** Selectable role options for a share role picker (label + value). */
export const CALENDAR_SHARE_ROLE_OPTIONS: ReadonlyArray<{
	value: CalendarShareRole;
	label: string;
}> = CALENDAR_SHARE_ROLES.map((value) => ({
	value,
	label: CALENDAR_SHARE_ROLE_LABELS[value],
}));

/** Type guard for an arbitrary string being a known share role. */
export function isCalendarShareRole(value: string): value is CalendarShareRole {
	return (CALENDAR_SHARE_ROLES as readonly string[]).includes(value);
}

/** Normalised form values shared by the rename portion of the settings form. */
export interface CalendarRenameDraft {
	name: string;
	color: string;
	timezone: string;
}

/**
 * Build the `updateCalendar` mutation payload from a draft, omitting fields that
 * are unchanged from the current calendar so a partial update never clobbers an
 * untouched value. Returns `null` when nothing changed (caller can skip the
 * mutation). `color` is sent as `null` when cleared to an empty string.
 */
export function buildCalendarUpdateInput(
	calendarId: string,
	draft: CalendarRenameDraft,
	current: { name: string; color: string | null; timezone: string },
): {
	calendarId: string;
	name?: string;
	color?: string | null;
	timezone?: string;
} | null {
	const next: {
		calendarId: string;
		name?: string;
		color?: string | null;
		timezone?: string;
	} = { calendarId };
	let changed = false;

	const trimmedName = draft.name.trim();
	if (trimmedName.length > 0 && trimmedName !== current.name) {
		next.name = trimmedName;
		changed = true;
	}

	const trimmedColor = draft.color.trim();
	const nextColor = trimmedColor.length > 0 ? trimmedColor : null;
	if (nextColor !== (current.color ?? null)) {
		next.color = nextColor;
		changed = true;
	}

	const trimmedTz = draft.timezone.trim();
	if (trimmedTz.length > 0 && trimmedTz !== current.timezone) {
		next.timezone = trimmedTz;
		changed = true;
	}

	return changed ? next : null;
}
