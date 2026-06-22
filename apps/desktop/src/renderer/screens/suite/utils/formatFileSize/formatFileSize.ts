/**
 * Human-readable byte size for Drive file rows (e.g. `1.5 MB`).
 *
 * Pure + dependency-free so it is unit-tested in isolation. Uses binary units
 * (1 KB = 1024 B) to match the storage-quota accounting in `@rox/shared`.
 */
export function formatFileSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "—";
	if (bytes < 1024) return `${bytes} B`;

	const units = ["KB", "MB", "GB", "TB"] as const;
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	// One decimal place below 10, none above — keeps `9.8 MB` but `512 KB`.
	const formatted =
		value >= 10 ? Math.round(value).toString() : value.toFixed(1);
	return `${formatted} ${units[unitIndex]}`;
}
