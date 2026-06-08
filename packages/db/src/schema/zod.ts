import { z } from "zod";
import {
	roxLedgerKindEnum,
	roxTopupStatusEnum,
	sandboxStatusEnum,
} from "./enums";

export const localWorkspaceConfigSchema = z.object({
	path: z.string(),
	branch: z.string(),
});
export type LocalWorkspaceConfig = z.infer<typeof localWorkspaceConfigSchema>;

export const cloudWorkspaceConfigSchema = z.object({
	modalSandboxId: z.string().optional(),
	modalObjectId: z.string().optional(),
	snapshotImageId: z.string().optional(),
	status: sandboxStatusEnum,
	lastSpawnedAt: z.string().optional(),
	lastActivityAt: z.string().optional(),
	lastSpawnError: z.string().optional(),
	lastSpawnErrorAt: z.string().optional(),
	spawnFailureCount: z.number().default(0),
});
export type CloudWorkspaceConfig = z.infer<typeof cloudWorkspaceConfigSchema>;

export const workspaceConfigSchema = z.union([
	localWorkspaceConfigSchema,
	cloudWorkspaceConfigSchema,
]);
export type WorkspaceConfig = LocalWorkspaceConfig | CloudWorkspaceConfig;

export const sandboxImageSchema = z.object({
	setupCommands: z.array(z.string()).default([]),
	baseImage: z.string().nullable().optional(),
	systemPackages: z.array(z.string()).default([]),
});
export type SandboxImageInput = z.infer<typeof sandboxImageSchema>;

// Billing & Economy (billing-economy epic) ------------------------------------

/** Input for the economy `topUp` mutation: how much USDT to convert to Rox. */
export const roxTopUpInputSchema = z.object({
	usdtAmount: z.number().positive(),
});
export type RoxTopUpInput = z.infer<typeof roxTopUpInputSchema>;

/** A single rox ledger entry as surfaced by the `history` query. */
export const roxLedgerEntrySchema = z.object({
	id: z.string().uuid(),
	deltaRox: z.string(),
	kind: roxLedgerKindEnum,
	usageRequestId: z.string().uuid().nullable(),
	topupId: z.string().uuid().nullable(),
	createdAt: z.date(),
});
export type RoxLedgerEntry = z.infer<typeof roxLedgerEntrySchema>;

export const roxTopupViewSchema = z.object({
	id: z.string().uuid(),
	usdtAmount: z.string(),
	roxAmount: z.string(),
	dvnetInvoiceId: z.string(),
	status: roxTopupStatusEnum,
	confirmedAt: z.date().nullable(),
	createdAt: z.date(),
});
export type RoxTopupView = z.infer<typeof roxTopupViewSchema>;
