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

export const evaluationStatusValues = [
	"pending",
	"running",
	"passed",
	"failed",
	"error",
] as const;
export const evaluationStatusEnum = z.enum(evaluationStatusValues);
export type EvaluationStatus = z.infer<typeof evaluationStatusEnum>;
