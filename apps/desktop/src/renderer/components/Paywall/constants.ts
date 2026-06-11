export const GATED_FEATURES = {
	INVITE_MEMBERS: "invite-members",
	TASKS: "tasks",
	REMOTE_WORKSPACES: "remote-workspaces",
	MOBILE_APP: "mobile-app",
} as const;

export type GatedFeature = (typeof GATED_FEATURES)[keyof typeof GATED_FEATURES];
