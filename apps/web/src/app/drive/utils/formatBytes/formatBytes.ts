/**
 * Human-readable byte formatter for the Drive UI (file sizes + quota bar).
 *
 * Uses binary units (KiB/MiB/GiB) to match the 10 GiB quota wording from the
 * D8 spec (DRIVE_FREE_QUOTA_BYTES = 10 * 1024^3). Pure + dependency-free so it
 * unit-tests without a DOM.
 */

const UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

export function formatBytes(bytes: number, fractionDigits = 1): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const exponent = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		UNITS.length - 1,
	);
	const value = bytes / 1024 ** exponent;
	// Whole bytes never need a fraction.
	const digits = exponent === 0 ? 0 : fractionDigits;
	return `${value.toFixed(digits)} ${UNITS[exponent]}`;
}
