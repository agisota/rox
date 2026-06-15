import { agentSourceKindEnum, agentSourceStatusEnum } from "@rox/db/enums";
import { z } from "zod";

const slugSchema = z
	.string()
	.min(1)
	.max(80)
	.regex(/^[a-z0-9-]+$/, "Slug must be kebab-case (a-z, 0-9, -)");

/**
 * Plaintext credential map supplied by clients on create/update. Never stored
 * verbatim — it is JSON-stringified and AES-encrypted into `encryptedConfig`,
 * and never returned through `list`/`get`.
 */
const credentialsSchema = z.record(z.string(), z.string());

const configSchema = z.record(z.string(), z.unknown());
const capabilitiesSchema = z.array(z.string());
const httpsEndpointUrlSchema = z
	.string()
	.url()
	.max(2048)
	.refine(
		(value) => {
			try {
				return new URL(value).protocol === "https:";
			} catch {
				return false;
			}
		},
		{
			message: "Endpoint URL must use HTTPS",
		},
	);

export const listAgentSourcesSchema = z.object({
	organizationId: z.string().uuid(),
	v2ProjectId: z.string().uuid().optional(),
});

export const agentSourceIdSchema = z.object({
	id: z.string().uuid(),
	organizationId: z.string().uuid(),
});

export const createAgentSourceSchema = z.object({
	organizationId: z.string().uuid(),
	v2ProjectId: z.string().uuid().optional(),
	name: z.string().min(1).max(120),
	slug: slugSchema,
	kind: agentSourceKindEnum,
	description: z.string().max(2000).optional(),
	endpointUrl: httpsEndpointUrlSchema.optional(),
	integrationConnectionId: z.string().uuid().optional(),
	config: configSchema.optional(),
	capabilities: capabilitiesSchema.optional(),
	version: z.string().max(120).optional(),
	credentials: credentialsSchema.optional(),
});

export const updateAgentSourceSchema = z.object({
	id: z.string().uuid(),
	organizationId: z.string().uuid(),
	name: z.string().min(1).max(120).optional(),
	slug: slugSchema.optional(),
	kind: agentSourceKindEnum.optional(),
	description: z.string().max(2000).nullable().optional(),
	endpointUrl: httpsEndpointUrlSchema.nullable().optional(),
	integrationConnectionId: z.string().uuid().nullable().optional(),
	config: configSchema.optional(),
	capabilities: capabilitiesSchema.optional(),
	version: z.string().max(120).nullable().optional(),
	credentials: credentialsSchema.optional(),
});

export const setAgentSourceStatusSchema = z.object({
	id: z.string().uuid(),
	organizationId: z.string().uuid(),
	status: agentSourceStatusEnum,
});

export type ListAgentSourcesInput = z.infer<typeof listAgentSourcesSchema>;
export type CreateAgentSourceInput = z.infer<typeof createAgentSourceSchema>;
export type UpdateAgentSourceInput = z.infer<typeof updateAgentSourceSchema>;
