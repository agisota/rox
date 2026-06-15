import { chatServiceTrpc } from "@rox/chat/client";
import { ModelSelectorLogo } from "@rox/ui/ai-elements/model-selector";
import { Badge } from "@rox/ui/badge";
import { Input } from "@rox/ui/input";
import { toast } from "@rox/ui/sonner";
import { useMemo, useState } from "react";
import {
	type ApiKeyProviderConfig,
	getStatusBadge,
	resolveProviderStatus,
} from "../../utils";
import { ConfigRow } from "../ConfigRow";
import { SettingsSection } from "../SettingsSection";

const STATUS_BADGE_LABELS: Record<string, string> = {
	"Not connected": "Не подключено",
	Expired: "Истекло",
	"Needs attention": "Требует внимания",
	Active: "Активно",
};

function getStatusBadgeLabel(label: string): string {
	return STATUS_BADGE_LABELS[label] ?? label;
}

interface ApiKeyProviderSectionProps {
	config: ApiKeyProviderConfig;
}

export function ApiKeyProviderSection({ config }: ApiKeyProviderSectionProps) {
	const [apiKeyInput, setApiKeyInput] = useState("");
	const { data: authStatus, refetch } =
		chatServiceTrpc.auth.getApiKeyProviderStatus.useQuery({
			providerId: config.id,
		});
	const setApiKeyMutation =
		chatServiceTrpc.auth.setApiKeyProviderApiKey.useMutation();
	const clearApiKeyMutation =
		chatServiceTrpc.auth.clearApiKeyProviderApiKey.useMutation();
	const isSaving = setApiKeyMutation.isPending || clearApiKeyMutation.isPending;

	const status = useMemo(
		() =>
			resolveProviderStatus({
				providerId: config.id,
				authStatus,
			}),
		[authStatus, config.id],
	);
	const badge = useMemo(() => getStatusBadge(status), [status]);

	const saveApiKey = async () => {
		const apiKey = apiKeyInput.trim();
		if (!apiKey) return;
		try {
			await setApiKeyMutation.mutateAsync({
				providerId: config.id,
				apiKey,
			});
			setApiKeyInput("");
			await refetch();
			toast.success(`Ключ API ${config.title} обновлён`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Не удалось сохранить",
			);
		}
	};

	const clearApiKey = async () => {
		try {
			await clearApiKeyMutation.mutateAsync({ providerId: config.id });
			setApiKeyInput("");
			await refetch();
			toast.success(`Ключ API ${config.title} удалён`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Не удалось удалить",
			);
		}
	};

	return (
		<SettingsSection
			title={config.title}
			icon={<ModelSelectorLogo provider={config.iconProvider} />}
			description={config.description}
			action={
				badge ? (
					<Badge variant={badge.variant}>
						{getStatusBadgeLabel(badge.label)}
					</Badge>
				) : null
			}
		>
			<ConfigRow
				title="Ключ API"
				description={config.helpText}
				htmlFor={`${config.id}-api-key`}
				field={
					<Input
						id={`${config.id}-api-key`}
						type="password"
						value={apiKeyInput}
						onChange={(event) => {
							setApiKeyInput(event.target.value);
						}}
						placeholder={
							status?.authMethod === "api_key"
								? `Сохранённый ключ API ${config.title}`
								: config.apiKeyPlaceholder
						}
						className="font-mono"
						disabled={isSaving}
					/>
				}
				onSave={() => {
					void saveApiKey();
				}}
				onClear={() => {
					void clearApiKey();
				}}
				showSave={apiKeyInput.trim().length > 0}
				disableSave={isSaving}
				showClear={status?.authMethod === "api_key"}
				disableClear={isSaving}
			/>
		</SettingsSection>
	);
}
