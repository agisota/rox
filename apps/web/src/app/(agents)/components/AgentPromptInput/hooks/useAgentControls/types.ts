import type {
	AgentSourceKind,
	AgentSourceStatus,
	ChatSessionStatus,
} from "@rox/db/enums";

export type ChatSessionStatusValue = ChatSessionStatus;

export type AgentSourceOption = {
	id: string;
	name: string;
	slug: string;
	kind: AgentSourceKind;
	status: AgentSourceStatus;
};

export type SkillBindingOption = {
	id: string;
	skillId: string;
	surface: "agent_tool" | "mcp";
	label: string;
};

export type AgentControlsQueryError = unknown;

export type AgentControlsData = {
	hasOrg: boolean;
	sources: AgentSourceOption[];
	sourcesPending: boolean;
	sourcesError: AgentControlsQueryError | null;
	retrySources: () => void;
	skillBindings: SkillBindingOption[];
	skillsPending: boolean;
	agentToolBindingsError: AgentControlsQueryError | null;
	mcpBindingsError: AgentControlsQueryError | null;
	skillsError: AgentControlsQueryError | null;
	retryAgentToolBindings: () => void;
	retryMcpBindings: () => void;
	retrySkills: () => void;
	statusOptions: ChatSessionStatusValue[];
	selectedSource: AgentSourceOption | null;
	selectSource: (sourceId: string | null) => void;
	selectedSkillBindings: SkillBindingOption[];
	toggleSkillBinding: (bindingId: string) => void;
	labels: string[];
	addLabel: (label: string) => void;
	removeLabel: (label: string) => void;
	status: ChatSessionStatusValue;
	setStatus: (status: ChatSessionStatusValue) => void;
};
