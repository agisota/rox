export interface McpContext {
	userId: string;
	organizationId: string;
	source?:
		| "slack"
		| "telegram"
		| "discord"
		| "lark"
		| "desktop"
		| "api"
		| "external";
}
