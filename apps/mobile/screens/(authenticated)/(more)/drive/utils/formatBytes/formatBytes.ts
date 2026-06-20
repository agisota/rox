/**
 * Human-readable byte size (e.g. "1.2 MB"). Binary units, one decimal for
 * >= 1 KB, no decimal for raw bytes.
 */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toFixed(1)} ${units[unitIndex]}`;
}
