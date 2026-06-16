import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { API_KEY_AUTH_PROVIDER_IDS } from "../auth/provider-ids";
import type { ChatService } from "../chat-service";
import { getSlashCommands, resolveSlashCommand } from "../slash-commands";
import { searchFiles } from "./file-search";
import { getMcpOverview } from "./mcp-overview";

const t = initTRPC.create({ transformer: superjson });

export const searchFilesInput = z.object({
	rootPath: z.string(),
	query: z.string(),
	includeHidden: z.boolean().default(false),
	limit: z.number().default(20),
});

export const getSlashCommandsInput = z.object({
	cwd: z.string(),
});

export const getMcpOverviewInput = z.object({
	cwd: z.string(),
});

export const resolveSlashCommandInput = z.object({
	cwd: z.string(),
	text: z.string(),
});
export const previewSlashCommandInput = resolveSlashCommandInput;

export const anthropicOAuthCodeInput = z.object({
	code: z.string().min(1),
});

export const openAIOAuthCodeInput = z.object({
	code: z.string().optional(),
});

export const anthropicApiKeyInput = z.object({
	apiKey: z.string().min(1),
});

export const anthropicEnvConfigInput = z.object({
	envText: z.string(),
});

export const openAIApiKeyInput = z.object({
	apiKey: z.string().min(1),
});

export const apiKeyProviderInput = z.object({
	providerId: z.enum(API_KEY_AUTH_PROVIDER_IDS),
});

export const apiKeyProviderApiKeyInput = apiKeyProviderInput.extend({
	apiKey: z.string().min(1),
});

export const customProviderDiscoverInput = z.object({
	baseUrl: z.string().min(1),
	apiKey: z.string().min(1),
});

export const customProviderConfigInput = z.object({
	baseUrl: z.string().min(1),
	apiKey: z.string().min(1),
	modelId: z.string().min(1),
});

function resolveWorkspaceSlashCommand(input: { cwd: string; text: string }) {
	return resolveSlashCommand(input.cwd, input.text);
}

export function createChatServiceRouter(service: ChatService) {
	return t.router({
		workspace: t.router({
			searchFiles: t.procedure
				.input(searchFilesInput)
				.query(async ({ input }) => {
					return searchFiles({
						rootPath: input.rootPath,
						query: input.query,
						includeHidden: input.includeHidden,
						limit: input.limit,
					});
				}),

			getSlashCommands: t.procedure
				.input(getSlashCommandsInput)
				.query(async ({ input }) => {
					return getSlashCommands(input.cwd);
				}),

			getMcpOverview: t.procedure
				.input(getMcpOverviewInput)
				.query(async ({ input }) => {
					return getMcpOverview(input.cwd);
				}),

			resolveSlashCommand: t.procedure
				.input(resolveSlashCommandInput)
				.mutation(async ({ input }) => {
					return resolveWorkspaceSlashCommand(input);
				}),

			previewSlashCommand: t.procedure
				.input(resolveSlashCommandInput)
				.query(async ({ input }) => {
					return resolveWorkspaceSlashCommand(input);
				}),
		}),

		auth: t.router({
			getAnthropicStatus: t.procedure.query(() => {
				return service.getAnthropicAuthStatus();
			}),
			getOpenAIStatus: t.procedure.query(() => {
				return service.getOpenAIAuthStatus();
			}),
			startOpenAIOAuth: t.procedure.mutation(() => {
				return service.startOpenAIOAuth();
			}),
			completeOpenAIOAuth: t.procedure
				.input(openAIOAuthCodeInput)
				.mutation(async ({ input }) => {
					return service.completeOpenAIOAuth({ code: input.code });
				}),
			cancelOpenAIOAuth: t.procedure.mutation(() => {
				return service.cancelOpenAIOAuth();
			}),
			consumeOpenAIOAuthCallback: t.procedure.query(() => {
				return service.consumeOpenAIOAuthCallback();
			}),
			disconnectOpenAIOAuth: t.procedure.mutation(() => {
				return service.disconnectOpenAIOAuth();
			}),
			startAnthropicOAuth: t.procedure.mutation(() => {
				return service.startAnthropicOAuth();
			}),
			completeAnthropicOAuth: t.procedure
				.input(anthropicOAuthCodeInput)
				.mutation(async ({ input }) => {
					return service.completeAnthropicOAuth({ code: input.code });
				}),
			cancelAnthropicOAuth: t.procedure.mutation(() => {
				return service.cancelAnthropicOAuth();
			}),
			disconnectAnthropicOAuth: t.procedure.mutation(() => {
				return service.disconnectAnthropicOAuth();
			}),
			setAnthropicApiKey: t.procedure
				.input(anthropicApiKeyInput)
				.mutation(({ input }) => {
					return service.setAnthropicApiKey({ apiKey: input.apiKey });
				}),
			getAnthropicEnvConfig: t.procedure.query(() => {
				return service.getAnthropicEnvConfig();
			}),
			setAnthropicEnvConfig: t.procedure
				.input(anthropicEnvConfigInput)
				.mutation(({ input }) => {
					return service.setAnthropicEnvConfig({
						envText: input.envText,
					});
				}),
			clearAnthropicEnvConfig: t.procedure.mutation(() => {
				return service.clearAnthropicEnvConfig();
			}),
			clearAnthropicApiKey: t.procedure.mutation(() => {
				return service.clearAnthropicApiKey();
			}),
			setOpenAIApiKey: t.procedure
				.input(openAIApiKeyInput)
				.mutation(({ input }) => {
					return service.setOpenAIApiKey({ apiKey: input.apiKey });
				}),
			clearOpenAIApiKey: t.procedure.mutation(() => {
				return service.clearOpenAIApiKey();
			}),
			getApiKeyProviderStatus: t.procedure
				.input(apiKeyProviderInput)
				.query(({ input }) => {
					return service.getApiKeyProviderAuthStatus({
						providerId: input.providerId,
					});
				}),
			setApiKeyProviderApiKey: t.procedure
				.input(apiKeyProviderApiKeyInput)
				.mutation(({ input }) => {
					return service.setApiKeyProviderApiKey({
						providerId: input.providerId,
						apiKey: input.apiKey,
					});
				}),
			clearApiKeyProviderApiKey: t.procedure
				.input(apiKeyProviderInput)
				.mutation(({ input }) => {
					return service.clearApiKeyProviderApiKey({
						providerId: input.providerId,
					});
				}),
			getCustomProviderConfig: t.procedure.query(() => {
				return service.getCustomProviderConfig();
			}),
			discoverCustomProviderModels: t.procedure
				.input(customProviderDiscoverInput)
				.mutation(({ input }) => {
					return service.discoverCustomProviderModels({
						baseUrl: input.baseUrl,
						apiKey: input.apiKey,
					});
				}),
			setCustomProviderConfig: t.procedure
				.input(customProviderConfigInput)
				.mutation(({ input }) => {
					return service.setCustomProviderConfig({
						baseUrl: input.baseUrl,
						apiKey: input.apiKey,
						modelId: input.modelId,
					});
				}),
			clearCustomProviderConfig: t.procedure.mutation(() => {
				return service.clearCustomProviderConfig();
			}),
		}),
	});
}

export type ChatServiceRouter = ReturnType<typeof createChatServiceRouter>;
