import type { IconType } from "react-icons";
import { FaGithub, FaTelegram, FaXTwitter, FaYandex } from "react-icons/fa6";
import { MdAlternateEmail } from "react-icons/md";

/**
 * Display metadata for a linked OAuth provider, keyed by better-auth
 * `auth.accounts.provider_id`. Used by both the connected-accounts list and the
 * locked-state "providers still needed" hint.
 */
export type ProviderMeta = {
	label: string;
	Icon: IconType;
};

const PROVIDER_META: Record<string, ProviderMeta> = {
	github: { label: "GitHub", Icon: FaGithub },
	telegram: { label: "Telegram", Icon: FaTelegram },
	x: { label: "X", Icon: FaXTwitter },
	yandex: { label: "Yandex", Icon: FaYandex },
	email: { label: "Email", Icon: MdAlternateEmail },
};

export function providerMeta(providerId: string): ProviderMeta {
	return (
		PROVIDER_META[providerId] ?? { label: providerId, Icon: MdAlternateEmail }
	);
}
