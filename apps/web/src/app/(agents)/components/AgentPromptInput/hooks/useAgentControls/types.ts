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

export type AgentControlsData = {
	hasOrg: boolean;
	sources: AgentSourceOption[];
	sourcesPending: boolean;
	skillBindings: SkillBindingOption[];
	skillsPending: boolean;
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
