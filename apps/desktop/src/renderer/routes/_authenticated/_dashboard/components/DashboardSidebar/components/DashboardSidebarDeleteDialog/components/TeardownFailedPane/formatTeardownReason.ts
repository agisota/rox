import type { TeardownFailureCause } from "@rox/host-service";
import { TEARDOWN_TIMEOUT_MS } from "@rox/shared/constants";

/** Human-readable one-liner for the dialog title when teardown fails. */
export function formatTeardownReason(cause: TeardownFailureCause): string {
	if (cause.timedOut) {
		return `Скрипт очистки превысил время ожидания (${Math.round(TEARDOWN_TIMEOUT_MS / 1000)} с)`;
	}
	if (cause.exitCode != null) {
		return `Скрипт очистки завершился с кодом ${cause.exitCode}`;
	}
	if (cause.signal != null) {
		return `Скрипт очистки прерван сигналом ${cause.signal}`;
	}
	return "Не удалось запустить скрипт очистки";
}
