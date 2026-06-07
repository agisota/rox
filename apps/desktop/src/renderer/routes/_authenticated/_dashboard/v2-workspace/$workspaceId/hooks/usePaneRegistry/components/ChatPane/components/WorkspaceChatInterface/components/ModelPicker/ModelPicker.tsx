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
import { workspaceTrpc } from "@rox/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { LayoutGroup, motion } from "framer-motion";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { PILL_BUTTON_CLASS } from "renderer/components/Chat/ChatInterface/styles";
import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import {
	motionDuration,
	motionSpring,
	useShouldAnimate,
} from "renderer/motion";
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
}

export function ModelPicker({
	models,
	selectedModel,
	onSelectModel,
	open,
	onOpenChange,
}: ModelPickerProps) {
	const navigate = useNavigate();
	const groupedModels = useMemo(() => groupModelsByProvider(models), [models]);
	const selectedLogo = selectedModel
		? providerToLogo(selectedModel.provider)
		: null;
	const { data: anthropicStatus, refetch: refetchAnthropicStatus } =
		workspaceTrpc.auth.getAnthropicStatus.useQuery();
	const { data: openAIStatus, refetch: refetchOpenAIStatus } =
		workspaceTrpc.auth.getOpenAIStatus.useQuery();
	const animate = useShouldAnimate("decorative");

	useEffect(() => {
		if (!open) return;
		void Promise.all([refetchAnthropicStatus(), refetchOpenAIStatus()]);
	}, [open, refetchAnthropicStatus, refetchOpenAIStatus]);

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
						<span>{selectedModel?.name ?? "Model"}</span>
						<ChevronDownIcon className="size-2.5 opacity-50" />
					</PromptInputButton>
				</ModelSelectorTrigger>
				<ModelSelectorContent title="Select Model">
					<motion.div
						initial={animate ? { opacity: 0, scale: 0.96, y: -4 } : false}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						transition={animate ? motionSpring.snappy : { duration: 0 }}
						style={{ transformOrigin: "top" }}
					>
						<ModelSelectorInput placeholder="Search models..." />
						<ModelSelectorList>
							<ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
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
