/**
 * Compact human-readable byte size for the Files-tab tree row decoration
 * (e.g. "1.2 MB"). Binary steps, one decimal from KB up, whole bytes have no
 * fraction. Pure + dependency-free so it unit-tests without a DOM.
 *
 * The repo has other `formatBytes` helpers (apps/web Drive uses KiB units,
 * apps/mobile Drive uses KB) but neither is importable from the desktop
 * renderer, so this stays a tiny local copy in the FilesTab style (compact KB
 * units, which read best in a narrow tree column).
 */

const UNITS = ["KB", "MB", "GB", "TB", "PB"] as const;

export function formatFileSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
	if (bytes < 1024) return `${bytes} B`;
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < UNITS.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	// Index is bounded by the loop guard, so a fallback keeps it total under
	// `noUncheckedIndexedAccess` without ever being reached.
	const unit = UNITS[unitIndex] ?? "PB";
	return `${value.toFixed(1)} ${unit}`;
}
