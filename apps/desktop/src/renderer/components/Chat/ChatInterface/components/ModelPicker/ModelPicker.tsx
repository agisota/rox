import { chatServiceTrpc } from "@rox/chat/client";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorInput,
	ModelSelectorList,
	ModelSelectorLogo,
	ModelSelectorTrigger,
} from "@rox/ui/ai-elements/model-selector";
import { PromptInputButton } from "@rox/ui/ai-elements/prompt-input";
import { claudeIcon } from "@rox/ui/icons/preset-icons";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { PILL_BUTTON_CLASS } from "../../styles";
import type { ModelOption } from "../../types";
import { ModelProviderGroup } from "./components/ModelProviderGroup";
import { groupModelsByProvider } from "./utils/groupModelsByProvider";
import {
	ANTHROPIC_LOGO_PROVIDER,
	providerToLogo,
} from "./utils/providerToLogo";

interface ModelPickerProps {
	models: ModelOption[];
	selectedModel: ModelOption | null;
	onSelectModel: (model: ModelOption) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/**
	 * Id of a persisted selection that could not be resolved against `models`
	 * (e.g. a custom-provider model whose `/v1/models` discovery failed). When
	 * set, the pill renders an explicit "unavailable" state instead of silently
	 * showing the house model as if it were the user's choice.
	 */
	unresolvedModelId?: string | null;
}

export function ModelPicker({
	models,
	selectedModel,
	onSelectModel,
	open,
	onOpenChange,
	unresolvedModelId,
}: ModelPickerProps) {
	const navigate = useNavigate();
	const groupedModels = useMemo(() => groupModelsByProvider(models), [models]);
	const isUnresolved = Boolean(unresolvedModelId);
	const selectedLogo =
		selectedModel && !isUnresolved
			? providerToLogo(selectedModel.provider)
			: null;
	const { data: anthropicStatus, refetch: refetchAnthropicStatus } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const { data: openAIStatus, refetch: refetchOpenAIStatus } =
		chatServiceTrpc.auth.getOpenAIStatus.useQuery();

	useEffect(() => {
		if (!open) return;
		void Promise.all([refetchAnthropicStatus(), refetchOpenAIStatus()]);
	}, [open, refetchAnthropicStatus, refetchOpenAIStatus]);

	const openModelsSettings = () => {
		onOpenChange(false);
		void navigate({ to: "/settings/models" });
	};

	return (
		<ModelSelector open={open} onOpenChange={onOpenChange}>
			<ModelSelectorTrigger asChild>
				<PromptInputButton
					className={`${PILL_BUTTON_CLASS} px-2 gap-1.5 text-xs ${
						isUnresolved ? "text-destructive" : "text-foreground"
					}`}
					title={
						isUnresolved
							? `Модель ${unresolvedModelId} недоступна — проверьте custom-провайдер`
							: undefined
					}
				>
					{isUnresolved ? (
						<TriangleAlertIcon className="size-3" />
					) : selectedLogo === ANTHROPIC_LOGO_PROVIDER ? (
						<img alt="Claude" className="size-3" src={claudeIcon} />
					) : selectedLogo ? (
						<ModelSelectorLogo provider={selectedLogo} />
					) : null}
					<span>
						{isUnresolved
							? `${unresolvedModelId} недоступна`
							: (selectedModel?.name ?? "Модель")}
					</span>
					<ChevronDownIcon className="size-2.5 opacity-50" />
				</PromptInputButton>
			</ModelSelectorTrigger>
			<ModelSelectorContent title="Выберите модель">
				<ModelSelectorInput placeholder="Поиск моделей..." />
				<ModelSelectorList>
					<ModelSelectorEmpty>Модели не найдены.</ModelSelectorEmpty>
					{groupedModels.map(([provider, providerModels]) => (
						<ModelProviderGroup
							key={provider}
							provider={provider}
							models={providerModels}
							isAnthropicAuthenticated={anthropicStatus?.authenticated ?? false}
							isAnthropicOAuthPending={false}
							isAnthropicApiKeyPending={false}
							onOpenAnthropicAuthModal={openModelsSettings}
							isOpenAIAuthenticated={openAIStatus?.authenticated ?? false}
							isOpenAIOAuthPending={false}
							isOpenAIApiKeyPending={false}
							onOpenOpenAIAuthModal={openModelsSettings}
							onSelectModel={onSelectModel}
							onCloseModelSelector={() => {
								onOpenChange(false);
							}}
						/>
					))}
				</ModelSelectorList>
			</ModelSelectorContent>
		</ModelSelector>
	);
}
