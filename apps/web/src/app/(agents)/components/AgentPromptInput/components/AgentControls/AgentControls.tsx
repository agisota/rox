"use client";

import type { AgentControlsData } from "../../hooks/useAgentControls";
import { LabelsControl } from "./components/LabelsControl";
import { SkillsSelector } from "./components/SkillsSelector";
import { SourceSelector } from "./components/SourceSelector";
import { StatusSelector } from "./components/StatusSelector";

type AgentControlsProps = {
	controls: AgentControlsData;
};

/**
 * Composer control cluster for the agent-native surface: pick an agent Source,
 * toggle exposed Skills (agent_tool/mcp bindings), manage session Labels and set
 * the session Status. Presentational — all data and selection state come from
 * `useAgentControls` via `controls`.
 */
export function AgentControls({ controls }: AgentControlsProps) {
	return (
		<>
			<SourceSelector
				sources={controls.sources}
				pending={controls.sourcesPending}
				selectedSource={controls.selectedSource}
				onSelect={controls.selectSource}
			/>
			<SkillsSelector
				skillBindings={controls.skillBindings}
				pending={controls.skillsPending}
				selectedSkillBindings={controls.selectedSkillBindings}
				onToggle={controls.toggleSkillBinding}
			/>
			<LabelsControl
				labels={controls.labels}
				onAdd={controls.addLabel}
				onRemove={controls.removeLabel}
			/>
			<StatusSelector
				status={controls.status}
				options={controls.statusOptions}
				onChange={controls.setStatus}
			/>
		</>
	);
}
