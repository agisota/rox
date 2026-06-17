import {
	ModelSelectorGroup,
	ModelSelectorItem,
	ModelSelectorLogo,
	ModelSelectorName,
} from "@rox/ui/ai-elements/model-selector";
import { claudeIcon } from "@rox/ui/icons/preset-icons";
import { motion } from "framer-motion";
import {
	type EnrichedModelOption,
	formatContextWindow,
} from "../../utils/modelCapabilities";
import {
	ANTHROPIC_LOGO_PROVIDER,
	OPENAI_LOGO_PROVIDER,
	providerToLogo,
} from "../../utils/providerToLogo";
import { ModelCapabilityBadges } from "../ModelCapabilityBadges";
import { ModelStrengthBar } from "../ModelStrengthBar";
import { AnthropicProviderHeading } from "./components/AnthropicProviderHeading";
import { OpenAIProviderHeading } from "./components/OpenAIProviderHeading";

interface ModelProviderGroupProps {
	provider: string;
	models: EnrichedModelOption[];
	isAnthropicAuthenticated: boolean;
	isAnthropicOAuthPending: boolean;
	isAnthropicApiKeyPending: boolean;
	onOpenAnthropicAuthModal: () => void;
	isOpenAIAuthenticated: boolean;
	isOpenAIOAuthPending: boolean;
	isOpenAIApiKeyPending: boolean;
	onOpenOpenAIAuthModal: () => void;
	onSelectModel: (model: EnrichedModelOption) => void;
	onCloseModelSelector: () => void;
	selectedModelId?: string;
	animate?: boolean;
}

export function ModelProviderGroup({
	provider,
	models,
	isAnthropicAuthenticated,
	isAnthropicOAuthPending,
	isAnthropicApiKeyPending,
	onOpenAnthropicAuthModal,
	isOpenAIAuthenticated,
	isOpenAIOAuthPending,
	isOpenAIApiKeyPending,
	onOpenOpenAIAuthModal,
	onSelectModel,
	onCloseModelSelector,
	selectedModelId,
	animate,
}: ModelProviderGroupProps) {
	const groupLogo = providerToLogo(provider);
	const isAnthropicProvider = groupLogo === ANTHROPIC_LOGO_PROVIDER;
	const isOpenAIProvider = groupLogo === OPENAI_LOGO_PROVIDER;
	// Models reaching this group are already filtered to activated providers
	// (plus Rox + custom), so every listed model is selectable. The OAuth
	// providers keep a heading affordance to jump to settings.

	return (
		<ModelSelectorGroup
			key={provider}
			heading={isAnthropicProvider || isOpenAIProvider ? undefined : provider}
		>
			{isAnthropicProvider ? (
				<AnthropicProviderHeading
					heading={provider}
					isConnected={isAnthropicAuthenticated}
					isPending={isAnthropicOAuthPending || isAnthropicApiKeyPending}
					onOpenAuthModal={onOpenAnthropicAuthModal}
				/>
			) : isOpenAIProvider ? (
				<OpenAIProviderHeading
					heading={provider}
					isConnected={isOpenAIAuthenticated}
					isPending={isOpenAIApiKeyPending || isOpenAIOAuthPending}
					onOpenAuthModal={onOpenOpenAIAuthModal}
				/>
			) : null}

			{models.map((model) => {
				const logo = providerToLogo(model.provider);
				const isSelected = animate && selectedModelId === model.id;
				const contextWindowLabel = formatContextWindow(
					model.contextWindowTokens,
				);

				return (
					<ModelSelectorItem
						key={model.id}
						// Include name + id + provider so the search box matches any of
						// them; cmdk filters on this value string.
						value={`${model.name} ${model.id} ${model.provider}`}
						onSelect={() => {
							onSelectModel(model);
							onCloseModelSelector();
						}}
						className="items-start gap-2 py-2"
					>
						{isSelected && (
							<motion.div
								layoutId="model-picker-active-pill"
								className="pointer-events-none absolute inset-0 rounded-[inherit] bg-accent/20"
							/>
						)}
						{logo === ANTHROPIC_LOGO_PROVIDER ? (
							<img alt="Claude" className="mt-0.5 size-3" src={claudeIcon} />
						) : (
							<ModelSelectorLogo provider={logo} className="mt-0.5" />
						)}
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<div className="flex items-center justify-between gap-2">
								<ModelSelectorName>{model.name}</ModelSelectorName>
								<ModelStrengthBar
									strength={model.strength}
									className="shrink-0"
								/>
							</div>
							<ModelCapabilityBadges
								capabilities={model.capabilities}
								contextWindowLabel={contextWindowLabel}
								contextWindowTokens={model.contextWindowTokens}
							/>
						</div>
					</ModelSelectorItem>
				);
			})}
		</ModelSelectorGroup>
	);
}
