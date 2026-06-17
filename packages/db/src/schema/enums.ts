import { z } from "zod";

export const taskStatusEnumValues = [
	"backlog",
	"todo",
	"planning",
	"working",
	"needs-feedback",
	"ready-to-merge",
	"completed",
	"canceled",
] as const;
export const taskStatusEnum = z.enum(taskStatusEnumValues);
export type TaskStatus = z.infer<typeof taskStatusEnum>;

export const taskPriorityValues = [
	"urgent",
	"high",
	"medium",
	"low",
	"none",
] as const;
export const taskPriorityEnum = z.enum(taskPriorityValues);
export type TaskPriority = z.infer<typeof taskPriorityEnum>;

export const integrationProviderValues = [
	"linear",
	"github",
	"slack",
	"telegram",
	"discord",
	"notion",
	"obsidian",
	"fibery",
	"lark",
] as const;
export const integrationProviderEnum = z.enum(integrationProviderValues);
export type IntegrationProvider = z.infer<typeof integrationProviderEnum>;

export const deviceTypeValues = ["desktop", "mobile", "web"] as const;
export const deviceTypeEnum = z.enum(deviceTypeValues);
export type DeviceType = z.infer<typeof deviceTypeEnum>;

export const v2ClientTypeValues = ["desktop", "mobile", "web"] as const;
export const v2ClientTypeEnum = z.enum(v2ClientTypeValues);
export type V2ClientType = z.infer<typeof v2ClientTypeEnum>;

export const v2UsersHostRoleValues = ["owner", "member"] as const;
export const v2UsersHostRoleEnum = z.enum(v2UsersHostRoleValues);
export type V2UsersHostRole = z.infer<typeof v2UsersHostRoleEnum>;

// Remote Hosts & Sandboxes (remote-hosts epic) --------------------------------
// `kind` distinguishes the local "this device" host from managed remote
// workspaces and ephemeral sandboxes. `provider` records which backend
// provisioned a managed host (or `self` for a user-run `rox deploy`).
// Append-only string unions backing Postgres pgEnums; never reorder/remove.
export const v2HostKindValues = ["local", "remote", "sandbox"] as const;
export const v2HostKindEnum = z.enum(v2HostKindValues);
export type V2HostKind = z.infer<typeof v2HostKindEnum>;

export const v2HostProviderValues = [
	"daytona",
	"modal",
	"e2b",
	"self",
] as const;
export const v2HostProviderEnum = z.enum(v2HostProviderValues);
export type V2HostProvider = z.infer<typeof v2HostProviderEnum>;

// Managed (provider-backed) host kinds — gated behind the paid-plan check.
export const v2ManagedHostKindValues = ["remote", "sandbox"] as const;
export const v2ManagedHostKindEnum = z.enum(v2ManagedHostKindValues);
export type V2ManagedHostKind = z.infer<typeof v2ManagedHostKindEnum>;

export const commandStatusValues = [
	"pending",
	"completed",
	"failed",
	"timeout",
] as const;
export const commandStatusEnum = z.enum(commandStatusValues);
export type CommandStatus = z.infer<typeof commandStatusEnum>;

export const sandboxStatusValues = [
	"pending",
	"spawning",
	"connecting",
	"warming",
	"syncing",
	"ready",
	"running",
	"stale",
	"snapshotting",
	"stopped",
	"failed",
] as const;
export const sandboxStatusEnum = z.enum(sandboxStatusValues);
export type SandboxStatus = z.infer<typeof sandboxStatusEnum>;

export const workspaceTypeValues = ["local", "cloud"] as const;
export const workspaceTypeEnum = z.enum(workspaceTypeValues);
export type WorkspaceType = z.infer<typeof workspaceTypeEnum>;

export const v2WorkspaceTypeValues = ["main", "worktree"] as const;
export const v2WorkspaceTypeEnum = z.enum(v2WorkspaceTypeValues);
export type V2WorkspaceType = z.infer<typeof v2WorkspaceTypeEnum>;

export const automationRunStatusValues = [
	"dispatching",
	"dispatched",
	"skipped_offline",
	"dispatch_failed",
] as const;
export const automationRunStatusEnum = z.enum(automationRunStatusValues);
export type AutomationRunStatus = z.infer<typeof automationRunStatusEnum>;

export const automationSessionKindValues = ["chat", "terminal"] as const;
export const automationSessionKindEnum = z.enum(automationSessionKindValues);
export type AutomationSessionKind = z.infer<typeof automationSessionKindEnum>;

export const automationPromptSourceValues = [
	"human",
	"agent",
	"restore",
] as const;
export const automationPromptSourceEnum = z.enum(automationPromptSourceValues);
export type AutomationPromptSource = z.infer<typeof automationPromptSourceEnum>;

// ---------------------------------------------------------------------------
// Automation Fabric: workflow / skill / run enums
// New graph-based workflow + skill layer that lives ALONGSIDE the legacy
// scheduled `automations` above. Append-only string unions (DB pgEnums).
// ---------------------------------------------------------------------------

export const workflowEngineValues = [
	"rox",
	"sim_sidecar",
	"legacy_automation",
	"external_tool",
	// Agent Pipelines: a workflow whose graph is mostly `agent_run` nodes.
	"pipeline",
] as const;
export const workflowEngineEnum = z.enum(workflowEngineValues);
export type WorkflowEngine = z.infer<typeof workflowEngineEnum>;

export const workflowStatusValues = [
	"draft",
	"published",
	"deprecated",
	"archived",
] as const;
export const workflowStatusEnum = z.enum(workflowStatusValues);
export type WorkflowStatus = z.infer<typeof workflowStatusEnum>;

export const workflowDeploymentStatusValues = [
	"active",
	"inactive",
	"failed",
] as const;
export const workflowDeploymentStatusEnum = z.enum(
	workflowDeploymentStatusValues,
);
export type WorkflowDeploymentStatus = z.infer<
	typeof workflowDeploymentStatusEnum
>;

export const skillKindValues = [
	"instruction",
	"workflow",
	"tool",
	"agent",
	"template",
] as const;
export const skillKindEnum = z.enum(skillKindValues);
export type SkillKind = z.infer<typeof skillKindEnum>;

export const skillStatusValues = [
	"draft",
	"published",
	"deprecated",
	"archived",
] as const;
export const skillStatusEnum = z.enum(skillStatusValues);
export type SkillStatus = z.infer<typeof skillStatusEnum>;

export const skillVisibilityValues = [
	"private",
	"project",
	"organization",
	"public",
] as const;
export const skillVisibilityEnum = z.enum(skillVisibilityValues);
export type SkillVisibility = z.infer<typeof skillVisibilityEnum>;

export const skillBindingSurfaceValues = [
	"object_action",
	"command_palette",
	"workflow_node",
	"agent_tool",
	"api",
	"mcp",
] as const;
export const skillBindingSurfaceEnum = z.enum(skillBindingSurfaceValues);
export type SkillBindingSurface = z.infer<typeof skillBindingSurfaceEnum>;

export const workflowRunStatusValues = [
	"queued",
	"running",
	"waiting_approval",
	"succeeded",
	"failed",
	"canceled",
	"timeout",
] as const;
export const workflowRunStatusEnum = z.enum(workflowRunStatusValues);
export type WorkflowRunStatus = z.infer<typeof workflowRunStatusEnum>;

export const workflowStepStatusValues = [
	"pending",
	"running",
	"succeeded",
	"failed",
	"skipped",
	"waiting_approval",
	"canceled",
] as const;
export const workflowStepStatusEnum = z.enum(workflowStepStatusValues);
export type WorkflowStepStatus = z.infer<typeof workflowStepStatusEnum>;

export const triggerKindValues = [
	"manual",
	"command",
	"chat",
	"schedule",
	"webhook",
	"api",
	"mcp",
	"repo_connected",
	"branch_created",
	"commit_pushed",
	"pr_opened",
	"task_created",
	"task_status_changed",
	"file_uploaded",
	"approval_resolved",
	"agent_run_finished",
	// Agent Pipelines event triggers (design spec §1.2 / §2.4). The other
	// product triggers reuse existing values (chat / agent_run_finished /
	// file_uploaded / repo_connected). `all_prior_agents_finished` is a graph
	// JOIN, not an enum value.
	"project_initialized",
	"service_connected",
] as const;
export const triggerKindEnum = z.enum(triggerKindValues);
export type TriggerKind = z.infer<typeof triggerKindEnum>;

export const objectTypeValues = [
	"organization",
	"project",
	"workspace",
	"repo",
	"task",
	"issue",
	"pr",
	"chat_session",
	"workflow",
	"skill",
	"run",
	"artifact",
	"approval",
	"policy",
	"agent_source",
	// Agent Pipelines: typed object-graph edges for trigger → run, etc.
	"pipeline_trigger",
] as const;
export const objectTypeEnum = z.enum(objectTypeValues);
export type ObjectType = z.infer<typeof objectTypeEnum>;

export const approvalStatusValues = [
	"pending",
	"approved",
	"rejected",
	"expired",
	"canceled",
] as const;
export const approvalStatusEnum = z.enum(approvalStatusValues);
export type ApprovalStatus = z.infer<typeof approvalStatusEnum>;

export const artifactKindValues = [
	"markdown_doc",
	"json",
	"table",
	"file",
	"repo_report",
	"task_plan",
	"pr_plan",
	"meeting_summary",
] as const;
export const artifactKindEnum = z.enum(artifactKindValues);
export type ArtifactKind = z.infer<typeof artifactKindEnum>;

export const publicShareResourceTypeValues = [
	"chat_session",
	"artifact",
] as const;
export const publicShareResourceTypeEnum = z.enum(
	publicShareResourceTypeValues,
);
export type PublicShareResourceType = z.infer<
	typeof publicShareResourceTypeEnum
>;

export const evaluationStatusValues = [
	"pending",
	"running",
	"passed",
	"failed",
	"error",
] as const;
export const evaluationStatusEnum = z.enum(evaluationStatusValues);
export type EvaluationStatus = z.infer<typeof evaluationStatusEnum>;

// Execution Circuit (execution-circuit epic) ------------------------------------

export const transitionRunStatusValues = [
	"pending",
	"running",
	"completed",
	"failed",
	"canceled",
] as const;
export const transitionRunStatusEnum = z.enum(transitionRunStatusValues);
export type TransitionRunStatus = z.infer<typeof transitionRunStatusEnum>;

export const traceEventKindValues = [
	"state_entered",
	"transition_started",
	"runtime_invoked",
	"output_received",
	"validator_passed",
	"validator_failed",
	"transition_completed",
	"transition_failed",
	"note",
] as const;
export const traceEventKindEnum = z.enum(traceEventKindValues);
export type TraceEventKind = z.infer<typeof traceEventKindEnum>;

// Access grants (members-teams-org epic) ---------------------------------------
// Resource sharing: grant a role on a resource to a user, a team, or the whole
// org. Append-only string unions backing Postgres pgEnums.

export const accessResourceTypeValues = [
	"project",
	"workspace",
	"host",
] as const;
export const accessResourceTypeEnum = z.enum(accessResourceTypeValues);
export type AccessResourceType = z.infer<typeof accessResourceTypeEnum>;

export const accessGranteeTypeValues = [
	"user",
	"team",
	"organization",
] as const;
export const accessGranteeTypeEnum = z.enum(accessGranteeTypeValues);
export type AccessGranteeType = z.infer<typeof accessGranteeTypeEnum>;

export const accessRoleValues = ["viewer", "editor", "admin"] as const;
export const accessRoleEnum = z.enum(accessRoleValues);
export type AccessRole = z.infer<typeof accessRoleEnum>;

// Knowledge / notebook layer (fumadocs epic) ----------------------------------
// Document "type" is the editorial kind shown in the notebook; "source kind" is
// how the document was produced (manual authoring, distilled from a chat, an
// agent run, an Obsidian import, or a flat file fallback).

export const knowledgeDocumentTypeValues = [
	"note",
	"prd",
	"spec",
	"doc",
	"meeting_summary",
	"reference",
] as const;
export const knowledgeDocumentTypeEnum = z.enum(knowledgeDocumentTypeValues);
export type KnowledgeDocumentType = z.infer<typeof knowledgeDocumentTypeEnum>;

export const knowledgeSourceKindValues = [
	"manual",
	"conversation",
	"agent_run",
	"obsidian_import",
	"file",
] as const;
export const knowledgeSourceKindEnum = z.enum(knowledgeSourceKindValues);
export type KnowledgeSourceKind = z.infer<typeof knowledgeSourceKindEnum>;

// Billing & Economy (billing-economy epic) ------------------------------------
// Append-only Rox ledger entries and dv.net top-up lifecycle. Backing Postgres
// pgEnums; never reorder/remove values.

export const roxLedgerKindValues = [
	"topup",
	"request_charge",
	"adjustment",
	"seed",
] as const;
export const roxLedgerKindEnum = z.enum(roxLedgerKindValues);
export type RoxLedgerKind = z.infer<typeof roxLedgerKindEnum>;

export const roxTopupStatusValues = [
	"pending",
	"confirmed",
	"failed",
	"expired",
] as const;
export const roxTopupStatusEnum = z.enum(roxTopupStatusValues);
export type RoxTopupStatus = z.infer<typeof roxTopupStatusEnum>;

// Agent-native: external agent "sources" (Claude Code, Codex, Cursor, MCP, …)
// + chat-session status. Append-only string unions backing Postgres pgEnums;
// never reorder/remove values.

export const agentSourceKindValues = [
	"claude_code",
	"codex",
	"cursor",
	"opencode",
	"mcp",
	"external_http",
] as const;
export const agentSourceKindEnum = z.enum(agentSourceKindValues);
export type AgentSourceKind = z.infer<typeof agentSourceKindEnum>;

export const agentSourceStatusValues = [
	"draft",
	"active",
	"deprecated",
	"archived",
] as const;
export const agentSourceStatusEnum = z.enum(agentSourceStatusValues);
export type AgentSourceStatus = z.infer<typeof agentSourceStatusEnum>;

export const chatSessionStatusValues = ["active", "archived"] as const;
export const chatSessionStatusEnum = z.enum(chatSessionStatusValues);
export type ChatSessionStatus = z.infer<typeof chatSessionStatusEnum>;

// Journal & Memory (journal-memory epic) --------------------------------------
// Per-user daily journal (AI-generated from chat sessions) + a curated memory
// store. Append-only string unions backing Postgres pgEnums; never reorder/remove.

export const journalEntryStatusValues = [
	"pending",
	"generated",
	"failed",
] as const;
export const journalEntryStatusEnum = z.enum(journalEntryStatusValues);
export type JournalEntryStatus = z.infer<typeof journalEntryStatusEnum>;

export const memoryCategoryValues = [
	"projects",
	"identity",
	"instructions",
	"career",
	"general",
] as const;
export const memoryCategoryEnum = z.enum(memoryCategoryValues);
export type MemoryCategory = z.infer<typeof memoryCategoryEnum>;

export const memorySourceValues = [
	"manual",
	"agent",
	"archive",
	"prompt",
] as const;
export const memorySourceEnum = z.enum(memorySourceValues);
export type MemorySource = z.infer<typeof memorySourceEnum>;

export const memoryStatusValues = [
	"suggested",
	"approved",
	"dismissed",
] as const;
export const memoryStatusEnum = z.enum(memoryStatusValues);
export type MemoryStatus = z.infer<typeof memoryStatusEnum>;

export const memoryImportProviderValues = ["chatgpt", "anthropic"] as const;
export const memoryImportProviderEnum = z.enum(memoryImportProviderValues);
export type MemoryImportProvider = z.infer<typeof memoryImportProviderEnum>;

export const memoryImportStatusValues = [
	"pending",
	"processing",
	"done",
	"failed",
] as const;
export const memoryImportStatusEnum = z.enum(memoryImportStatusValues);
export type MemoryImportStatus = z.infer<typeof memoryImportStatusEnum>;

// Voice dictation (voice-dictation epic) --------------------------------------
// Lifecycle of a dictated prompt: transcribed (Whisper done) → processed (R1
// post-processing done) or failed. Append-only string union backing a pgEnum.

export const voiceTranscriptionStatusValues = [
	"transcribed",
	"processed",
	"failed",
] as const;
export const voiceTranscriptionStatusEnum = z.enum(
	voiceTranscriptionStatusValues,
);
export type VoiceTranscriptionStatus = z.infer<
	typeof voiceTranscriptionStatusEnum
>;

// ---------------------------------------------------------------------------
// Core graph (#01, phase 0) — universal entity/edge/identity/activity backbone.
// These are the canonical kinds/relations/statuses for the graph core; every
// domain subsystem (notes, tasks, capture, chat, agent sessions, design) reuses
// them and never redefines core tables. Append-only string unions backing
// Postgres pgEnums (declared in schema/{entity,edges,identity,activity}.ts);
// NEVER reorder/remove values. Domains may only EXTEND these.
// ---------------------------------------------------------------------------

export const entityKindValues = [
	"note",
	"email",
	"email_thread",
	"message",
	"channel",
	"task",
	"project",
	"area",
	"calendar_event",
	"agent_session",
	"activity_event",
	"feed",
	"feed_item",
	"file",
	"design_artifact",
	"contact",
	"osint_entity",
	"tag",
	"journal",
] as const;
export const entityKindEnum = z.enum(entityKindValues);
export type EntityKind = z.infer<typeof entityKindEnum>;

export const edgeRelationValues = [
	"links_to",
	"derived_from",
	"attached_to",
	"scheduled_as",
	"blocks",
	"mentions",
	"authored_by",
	"participant_of",
	"replies_to",
	"child_of",
	"tagged_with",
	"about",
	"references",
	"embeds",
	"captured_from",
] as const;
export const edgeRelationEnum = z.enum(edgeRelationValues);
export type EdgeRelation = z.infer<typeof edgeRelationEnum>;

export const entityStatusValues = ["active", "archived", "trashed"] as const;
export const entityStatusEnum = z.enum(entityStatusValues);
export type EntityStatus = z.infer<typeof entityStatusEnum>;

export const identityKindValues = [
	"email",
	"chat",
	"attendee",
	"git",
	"selector",
	"phone",
	"domain",
] as const;
export const identityKindEnum = z.enum(identityKindValues);
export type IdentityKind = z.infer<typeof identityKindEnum>;

export const activityEventKindValues = [
	"screen_block",
	"app_usage",
	"session",
	"calendar",
	"comms",
	"feed_read",
	"journal",
	"file_op",
] as const;
export const activityEventKindEnum = z.enum(activityEventKindValues);
export type ActivityEventKind = z.infer<typeof activityEventKindEnum>;

// ---------------------------------------------------------------------------
// Infra-runtime (#02, phase 0) — control-plane detail enums for the runtime
// foundation (minio/qdrant/embedder/Turso/Electric). Append-only string unions
// backing Postgres pgEnums (declared in schema/runtime.ts). These do NOT
// overlap with the core graph enums above (entityKind/edgeRelation/…); the
// runtime never adds core kinds. NEVER reorder/remove values.
// ---------------------------------------------------------------------------

/** Logical bucket prefix in minio (A8). bucket = `org-<orgId>`, prefix below. */
export const storageBucketPrefixValues = [
	"files", // attachments, Drive
	"frames", // screen-capture frames (#8)
	"recordings", // audio/video recordings
	"artifacts", // design artifacts (#15)
	"exports", // vault snapshots / exports
	"sessions", // large agent-session transcripts (#11)
] as const;
export const storageBucketPrefixEnum = z.enum(storageBucketPrefixValues);
export type StorageBucketPrefix = z.infer<typeof storageBucketPrefixEnum>;

/** Lifecycle of a minio object (status enum instead of deleted_at). */
export const storageObjectStatusValues = [
	"pending", // presigned URL issued, object not yet confirmed by client
	"stored", // confirmed (HEAD passed), available
	"missing", // absent in minio (reconciliation found drift)
	"trashed", // marked for deletion (GC removes from minio)
] as const;
export const storageObjectStatusEnum = z.enum(storageObjectStatusValues);
export type StorageObjectStatus = z.infer<typeof storageObjectStatusEnum>;

/** State of an embedding job (entities→qdrant indexing queue). */
export const embeddingJobStatusValues = [
	"queued",
	"running",
	"done",
	"failed",
	"skipped", // no embed-text / non-indexable kind
] as const;
export const embeddingJobStatusEnum = z.enum(embeddingJobStatusValues);
export type EmbeddingJobStatus = z.infer<typeof embeddingJobStatusEnum>;

/** AI-provider capability backing an embed (D12). */
export const aiProviderKindValues = [
	"local", // ONNX/fastembed in-process
	"zed_gateway", // api.zed.md/v1 (R1 + Groq)
	"openai",
	"gemini",
	"anthropic",
] as const;
export const aiProviderKindEnum = z.enum(aiProviderKindValues);
export type AiProviderKind = z.infer<typeof aiProviderKindEnum>;

/** Kind of a provisioned runtime sidecar (service registry). */
export const runtimeServiceKindValues = [
	"minio",
	"qdrant",
	"embedder",
	"turso", // local-replica sync-engine (per-device)
	"electric", // shape-proxy upstream
] as const;
export const runtimeServiceKindEnum = z.enum(runtimeServiceKindValues);
export type RuntimeServiceKind = z.infer<typeof runtimeServiceKindEnum>;

/** Health of a runtime service. */
export const runtimeServiceStateValues = [
	"provisioning",
	"healthy",
	"degraded",
	"stopped",
	"failed",
] as const;
export const runtimeServiceStateEnum = z.enum(runtimeServiceStateValues);
export type RuntimeServiceState = z.infer<typeof runtimeServiceStateEnum>;
