/**
 * Resolve after `ms` milliseconds.
 *
 * The single shared implementation of the
 * `new Promise((resolve) => setTimeout(resolve, ms))` idiom that was
 * hand-rolled across apps and packages.
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
