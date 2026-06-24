import type { ReactNode } from "react";
import {
	SettingsCard,
	SettingsCardHeader,
} from "../../../../../components/SettingsCard";

interface SettingsSectionProps {
	title: string;
	icon?: ReactNode;
	description?: string;
	action?: ReactNode;
	children: ReactNode;
}

/**
 * Provider section card for the Модели page.
 *
 * Thin wrapper over the shared {@link SettingsCard} primitive (Settings P0
 * consolidation): keeps the exact `title/icon/description/action/children` API
 * the page already passes, but now renders the unified glass panel + header so
 * the Anthropic / OpenAI / custom-provider blocks match every other settings
 * section (and inherit the liquid-glass treatment under `.glass`).
 */
export function SettingsSection({
	title,
	icon,
	description,
	action,
	children,
}: SettingsSectionProps) {
	return (
		<SettingsCard
			divided={false}
			header={
				<SettingsCardHeader
					title={title}
					icon={icon}
					description={description}
					action={action}
				/>
			}
		>
			<div className="space-y-3 py-4">{children}</div>
		</SettingsCard>
	);
}
