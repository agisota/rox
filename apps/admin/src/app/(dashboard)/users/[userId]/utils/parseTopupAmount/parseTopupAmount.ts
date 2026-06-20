/**
 * Parse + validate the bonus-Rox top-up amount entered in TopUpDialog (WS-F T7).
 *
 * The dialog calls `economy.admin.grant.mutate({ userId, rox, note })`, whose
 * `rox` input is `z.number().positive()`. This pure parser turns the raw text
 * field into either a valid positive number or an error message, so the dialog
 * never sends an invalid mutation and the logic is unit-testable without React.
 */

export type ParseResult =
	| { ok: true; rox: number }
	| { ok: false; error: string };

export function parseTopupAmount(raw: string): ParseResult {
	const trimmed = raw.trim();
	if (trimmed === "") {
		return { ok: false, error: "Enter an amount." };
	}

	const value = Number(trimmed);
	if (!Number.isFinite(value)) {
		return { ok: false, error: "Amount must be a number." };
	}
	if (value <= 0) {
		return { ok: false, error: "Amount must be greater than zero." };
	}

	return { ok: true, rox: value };
}
