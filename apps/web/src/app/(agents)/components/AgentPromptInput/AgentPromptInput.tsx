"use client";

import {
	type MockModel,
	type MockRepo,
	type MockWorkspace,
	mockBranches,
	mockModels,
	mockRepos,
} from "../../mock-data";
import { PreviewPromptComposer } from "../PreviewPromptComposer";
import { AgentControls, SelectedChips } from "./components/AgentControls";
import { BranchSelector } from "./components/BranchSelector";
import { ModelPicker } from "./components/ModelPicker";
import { RepoSelector } from "./components/RepoSelector";
import { useAgentControls } from "./hooks/useAgentControls";
import { useAgentPrompt } from "./hooks/useAgentPrompt";

type AgentPromptInputProps = {
	branches?: string[];
	models?: MockModel[];
	repos?: MockRepo[];
	workspace: MockWorkspace;
};

export function AgentPromptInput({
	branches = mockBranches,
	models = mockModels,
	repos = mockRepos,
	workspace,
}: AgentPromptInputProps) {
	const {
		selectedModel,
		setSelectedModel,
		selectedRepo,
		setSelectedRepo,
		selectedBranch,
		setSelectedBranch,
	} = useAgentPrompt({
		branches,
		models,
		repos,
		workspace,
	});

	const controls = useAgentControls();
	const hasSelection =
		Boolean(controls.selectedSource) ||
		controls.selectedSkillBindings.length > 0 ||
		controls.labels.length > 0;

	return (
		<PreviewPromptComposer
			containerClassName="flex flex-col overflow-hidden rounded-[13px] border-[0.5px] border-border bg-foreground/[0.02]"
			promptInputClassName="[&>[data-slot=input-group]]:rounded-none [&>[data-slot=input-group]]:border-none [&>[data-slot=input-group]]:shadow-none"
			placeholder="Создание сессий в веб-версии скоро появится"
			footerToolsClassName="gap-1.5"
			header={hasSelection ? <SelectedChips controls={controls} /> : undefined}
			footerTools={
				<>
					<ModelPicker
						models={models}
						selectedModel={selectedModel}
						onModelChange={setSelectedModel}
						disabled
					/>
					<AgentControls controls={controls} />
				</>
			}
			afterComposer={
				<div className="flex items-center gap-2 border-t border-border/50 px-3 py-2">
					<RepoSelector
						repos={repos}
						selectedRepo={selectedRepo}
						onRepoChange={setSelectedRepo}
						disabled
					/>
					<BranchSelector
						branches={branches}
						selectedBranch={selectedBranch}
						onBranchChange={setSelectedBranch}
						disabled
					/>
				</div>
			}
			messageClassName="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground"
		/>
	);
}
