import type { RegistrationProvider } from "@rox/db/schema";

/**
 * Human label for the platform a user joined Rox through, shown as a badge on
 * the public profile header. Keyed by `registration_provider`.
 */
const PLATFORM_LABELS: Record<RegistrationProvider, string> = {
	telegram: "Telegram",
	yandex: "Yandex",
	x: "X",
	github: "GitHub",
	email: "Email",
};

export function platformLabel(
	provider: RegistrationProvider | null,
): string | null {
	if (!provider) return null;
	return PLATFORM_LABELS[provider] ?? null;
}
