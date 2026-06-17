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
import { motionDuration, motionSpring, useShouldAnimate } from "@rox/ui/motion";
import { useNavigate } from "@tanstack/react-router";
import { LayoutGroup, motion } from "framer-motion";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { PILL_BUTTON_CLASS } from "renderer/components/Chat/ChatInterface/styles";
import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import { ModelProviderGroup } from "./components/ModelProviderGroup";
import { groupModelsByProvider } from "./utils/groupModelsByProvider";
import {
	type EnrichedModelOption,
	enrichModelOption,
	rankEnrichedModels,
} from "./utils/modelCapabilities";
import {
	buildCustomProviderModel,
	CUSTOM_PROVIDER_DISPLAY_NAME,
	filterModelsByActivation,
	getActivatedProviderIds,
	type ProviderAuthStatuses,
	withCustomProviderModel,
} from "./utils/providerActivation";
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
}

/**
 * Order provider groups for display: Rox first (house model), then the user's
 * custom provider, then the rest by their strongest model so the most capable
 * connected provider sits near the top.
 */
function compareGroups(
	a: [string, EnrichedModelOption[]],
	b: [string, EnrichedModelOption[]],
): number {
	const rank = (provider: string, models: EnrichedModelOption[]): number => {
		if (providerToLogo(provider) === "rox" || provider === "Rox") return 0;
		if (provider === CUSTOM_PROVIDER_DISPLAY_NAME) return 1;
		// Lower sort value = earlier; invert strength so stronger sorts first.
		const topStrength = models.reduce(
			(max, model) => Math.max(max, model.strength),
			0,
		);
		return 2 + (100 - topStrength) / 100;
	};
	return rank(a[0], a[1]) - rank(b[0], b[1]);
}

export function ModelPicker({
	models,
	selectedModel,
	onSelectModel,
	open,
	onOpenChange,
}: ModelPickerProps) {
	const navigate = useNavigate();
	const selectedLogo = selectedModel
		? providerToLogo(selectedModel.provider)
		: null;

	const { data: anthropicStatus, refetch: refetchAnthropicStatus } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const { data: openAIStatus, refetch: refetchOpenAIStatus } =
		chatServiceTrpc.auth.getOpenAIStatus.useQuery();
	const { data: groqStatus, refetch: refetchGroqStatus } =
		chatServiceTrpc.auth.getApiKeyProviderStatus.useQuery({
			providerId: "groq",
		});
	const { data: googleStatus, refetch: refetchGoogleStatus } =
		chatServiceTrpc.auth.getApiKeyProviderStatus.useQuery({
			providerId: "google",
		});
	const { data: deepseekStatus, refetch: refetchDeepseekStatus } =
		chatServiceTrpc.auth.getApiKeyProviderStatus.useQuery({
			providerId: "deepseek",
		});
	const { data: customProviderConfig, refetch: refetchCustomProviderConfig } =
		chatServiceTrpc.auth.getCustomProviderConfig.useQuery();

	const animate = useShouldAnimate("decorative");

	// Refresh every provider's status when the picker opens so a key added in
	// Settings since last open is reflected immediately.
	useEffect(() => {
		if (!open) return;
		void Promise.all([
			refetchAnthropicStatus(),
			refetchOpenAIStatus(),
			refetchGroqStatus(),
			refetchGoogleStatus(),
			refetchDeepseekStatus(),
			refetchCustomProviderConfig(),
		]);
	}, [
		open,
		refetchAnthropicStatus,
		refetchOpenAIStatus,
		refetchGroqStatus,
		refetchGoogleStatus,
		refetchDeepseekStatus,
		refetchCustomProviderConfig,
	]);

	const groupedModels = useMemo(() => {
		const authStatuses: ProviderAuthStatuses = {
			anthropic: anthropicStatus,
			openai: openAIStatus,
			groq: groqStatus,
			google: googleStatus,
			deepseek: deepseekStatus,
		};
		const activatedProviderIds = getActivatedProviderIds(authStatuses);
		const customModel = buildCustomProviderModel(customProviderConfig);

		// Merge the user's custom model, hide models from providers they have not
		// activated, then enrich + rank within each provider group.
		const withCustom = withCustomProviderModel({ models, customModel });
		const visible = filterModelsByActivation({
			models: withCustom,
			activatedProviderIds,
		});
		const enriched = visible.map(enrichModelOption);
		return groupModelsByProvider(enriched)
			.map(
				([provider, providerModels]) =>
					[provider, rankEnrichedModels(providerModels)] as [
						string,
						EnrichedModelOption[],
					],
			)
			.sort(compareGroups);
	}, [
		models,
		anthropicStatus,
		openAIStatus,
		groqStatus,
		googleStatus,
		deepseekStatus,
		customProviderConfig,
	]);

	const openModelsSettings = () => {
		onOpenChange(false);
		void navigate({ to: "/settings/models" });
	};

	return (
		<LayoutGroup id="model-picker">
			<ModelSelector open={open} onOpenChange={onOpenChange}>
				<ModelSelectorTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} relative px-2 gap-1.5 text-xs text-foreground`}
					>
						{!open && animate && selectedModel && (
							<motion.div
								layoutId="model-picker-active-pill"
								className="pointer-events-none absolute inset-0 rounded-[inherit] bg-accent/10"
							/>
						)}
						{selectedLogo === ANTHROPIC_LOGO_PROVIDER ? (
							<img alt="Claude" className="size-3" src={claudeIcon} />
						) : selectedLogo ? (
							<ModelSelectorLogo provider={selectedLogo} />
						) : null}
						<span>{selectedModel?.name ?? "Модель"}</span>
						<ChevronDownIcon className="size-2.5 opacity-50" />
					</PromptInputButton>
				</ModelSelectorTrigger>
				<ModelSelectorContent title="Выбор модели">
					<motion.div
						initial={animate ? { opacity: 0, scale: 0.96, y: -4 } : false}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						transition={animate ? motionSpring.snappy : { duration: 0 }}
						style={{ transformOrigin: "top" }}
					>
						<ModelSelectorInput placeholder="Поиск моделей..." />
						<ModelSelectorList>
							<ModelSelectorEmpty>Модели не найдены.</ModelSelectorEmpty>
							{groupedModels.map(([provider, providerModels], index) => (
								<motion.div
									key={provider}
									initial={animate ? { opacity: 0, y: 6 } : false}
									animate={{ opacity: 1, y: 0 }}
									transition={{
										delay: animate ? index * 0.03 : 0,
										duration: motionDuration.fast,
									}}
								>
									<ModelProviderGroup
										provider={provider}
										models={providerModels}
										isAnthropicAuthenticated={
											anthropicStatus?.authenticated ?? false
										}
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
										selectedModelId={selectedModel?.id}
										animate={animate}
									/>
								</motion.div>
							))}
						</ModelSelectorList>
					</motion.div>
				</ModelSelectorContent>
			</ModelSelector>
		</LayoutGroup>
	);
}
