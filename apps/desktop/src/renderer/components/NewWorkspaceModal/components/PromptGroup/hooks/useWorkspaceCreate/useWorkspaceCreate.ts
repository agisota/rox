import type { AgentLaunchRequest } from "@rox/shared/agent-launch";
import { buildPromptAgentLaunchRequest } from "@rox/shared/agent-launch-request";
import type {
	AgentDefinitionId,
	indexResolvedAgentConfigs,
} from "@rox/shared/agent-settings";
import { sanitizeBranchNameWithMaxLength } from "@rox/shared/workspace-launch";
import { useProviderAttachments } from "@rox/ui/ai-elements/prompt-input";
import { isEnterSubmit } from "@rox/ui/lib/keyboard";
import { toast } from "@rox/ui/sonner";
import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useClearPendingWorkspace,
	useSetPendingWorkspace,
	useSetPendingWorkspaceStatus,
} from "renderer/stores/new-workspace-modal";
import type { useNewWorkspaceModalDraft } from "../../../../NewWorkspaceModalDraftContext";

type WorkspaceCreateAgent = AgentDefinitionId | "none";

type ConvertedFile = {
	data: string;
	mediaType: string;
	filename?: string;
};

type Draft = ReturnType<typeof useNewWorkspaceModalDraft>["draft"];

interface UseWorkspaceCreateParams {
	projectId: string | null;
	isNewWorkspaceModalOpen: boolean;
	selectedAgent: WorkspaceCreateAgent;
	agentConfigsById: ReturnType<typeof indexResolvedAgentConfigs>;
	draft: Draft;
	closeAndResetDraft: ReturnType<
		typeof useNewWorkspaceModalDraft
	>["closeAndResetDraft"];
	createWorkspace: ReturnType<
		typeof useNewWorkspaceModalDraft
	>["createWorkspace"];
	createFromPr: ReturnType<typeof useNewWorkspaceModalDraft>["createFromPr"];
	runAsyncAction: ReturnType<
		typeof useNewWorkspaceModalDraft
	>["runAsyncAction"];
}

/**
 * Encapsulates the create/launch/navigate flow for the new-workspace prompt:
 * branch-name AI generation, attachment + GitHub-issue conversion, launch
 * request construction, and the create-workspace / create-from-PR dispatch.
 *
 * Behavior-preserving extraction from PromptGroupInner — identical effect
 * ordering, dependency arrays, and submit guard semantics.
 */
export function useWorkspaceCreate({
	projectId,
	isNewWorkspaceModalOpen,
	selectedAgent,
	agentConfigsById,
	draft,
	closeAndResetDraft,
	createWorkspace,
	createFromPr,
	runAsyncAction,
}: UseWorkspaceCreateParams) {
	const utils = electronTrpc.useUtils();
	const attachments = useProviderAttachments();
	const clearPendingWorkspace = useClearPendingWorkspace();
	const setPendingWorkspace = useSetPendingWorkspace();
	const setPendingWorkspaceStatus = useSetPendingWorkspaceStatus();
	const {
		compareBaseBranch,
		prompt,
		runSetupScript,
		workspaceName,
		workspaceNameEdited,
		branchName,
		branchNameEdited,
		linkedIssues,
		linkedPR,
	} = draft;
	const submitStartedRef = useRef(false);
	const trimmedPrompt = prompt.trim();
	const firstIssueSlug = linkedIssues[0]?.slug ?? null;

	// AI branch name generation (on submit only)
	const generateBranchNameMutation =
		electronTrpc.workspaces.generateBranchName.useMutation();
	useEffect(() => {
		if (isNewWorkspaceModalOpen) {
			submitStartedRef.current = false;
		}
	}, [isNewWorkspaceModalOpen]);

	const buildLaunchRequest = useCallback(
		(prompt: string, files?: ConvertedFile[]): AgentLaunchRequest | null => {
			return buildPromptAgentLaunchRequest({
				workspaceId: "pending-workspace",
				source: "new-workspace",
				selectedAgent,
				prompt,
				initialFiles: files,
				taskSlug: firstIssueSlug || undefined,
				configsById: agentConfigsById,
			});
		},
		[agentConfigsById, firstIssueSlug, selectedAgent],
	);

	const convertBlobUrlToDataUrl = useCallback(
		async (url: string): Promise<string> => {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Failed to fetch attachment: ${response.statusText}`);
			}
			const blob = await response.blob();
			return new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onloadend = () => resolve(reader.result as string);
				reader.onerror = () =>
					reject(new Error("Failed to read attachment data"));
				reader.onabort = () => reject(new Error("Attachment read was aborted"));
				reader.readAsDataURL(blob);
			});
		},
		[],
	);

	const handleCreate = useCallback(
		async (preConvertedFiles?: ConvertedFile[]) => {
			if (!projectId) {
				toast.error("Сначала выберите проект");
				return;
			}

			if (submitStartedRef.current) {
				return;
			}
			submitStartedRef.current = true;

			const displayName =
				workspaceNameEdited && workspaceName.trim()
					? workspaceName.trim()
					: trimmedPrompt || "New workspace";
			const willGenerateAIName =
				!branchNameEdited && !!trimmedPrompt && !linkedPR;
			const pendingWorkspaceId = crypto.randomUUID();
			const detachedFiles = preConvertedFiles ? [] : attachments.takeFiles();

			setPendingWorkspace({
				id: pendingWorkspaceId,
				projectId,
				name: displayName,
				status: willGenerateAIName ? "generating-branch" : "preparing",
			});
			closeAndResetDraft();

			try {
				let aiBranchName: string | null = null;
				if (willGenerateAIName) {
					let timeoutId: NodeJS.Timeout | null = null;
					try {
						const AI_GENERATION_TIMEOUT_MS = 30000;
						const timeoutPromise = new Promise<never>((_, reject) => {
							timeoutId = setTimeout(
								() => reject(new Error("AI generation timeout")),
								AI_GENERATION_TIMEOUT_MS,
							);
						});

						const result = await Promise.race([
							generateBranchNameMutation.mutateAsync({
								prompt: trimmedPrompt,
								projectId,
							}),
							timeoutPromise,
						]);

						if (timeoutId) clearTimeout(timeoutId);
						aiBranchName = result.branchName;
					} catch (error) {
						if (timeoutId) clearTimeout(timeoutId);

						const errorMessage =
							error instanceof Error ? error.message : String(error);
						if (errorMessage.includes("timeout")) {
							console.warn("[PromptGroup] AI generation timeout");
							toast.info(
								"Используется случайное имя ветки (истекло время генерации ИИ)",
							);
						} else if (
							errorMessage.toLowerCase().includes("auth") ||
							errorMessage.includes("401") ||
							errorMessage.includes("403")
						) {
							console.error("[PromptGroup] AI auth error:", error);
							toast.error(
								"Не удалось пройти аутентификацию ИИ. Проверьте настройки ИИ.",
							);
							clearPendingWorkspace(pendingWorkspaceId);
							return;
						} else {
							console.warn("[PromptGroup] AI generation failed:", error);
							toast.info(
								"Используется случайное имя ветки (генерация ИИ недоступна)",
							);
						}
					} finally {
						setPendingWorkspaceStatus(pendingWorkspaceId, "preparing");
					}
				}

				let convertedFiles: ConvertedFile[] = preConvertedFiles ?? [];
				if (!preConvertedFiles && detachedFiles.length > 0) {
					try {
						convertedFiles = await Promise.all(
							detachedFiles.map(async (file) => ({
								data: await convertBlobUrlToDataUrl(file.url),
								mediaType: file.mediaType,
								filename: file.filename,
							})),
						);
					} catch (err) {
						clearPendingWorkspace(pendingWorkspaceId);
						toast.error(
							err instanceof Error
								? err.message
								: "Не удалось обработать вложения",
						);
						return;
					}
				}

				// Fetch and attach GitHub issue content
				const githubIssues = linkedIssues.filter(
					(issue): issue is typeof issue & { number: number } =>
						issue.source === "github" && typeof issue.number === "number",
				);
				if (githubIssues.length > 0 && projectId) {
					try {
						// Helper to add timeout to promises
						const fetchWithTimeout = <T>(
							promise: Promise<T>,
							timeoutMs: number,
						): Promise<T> => {
							return Promise.race([
								promise,
								new Promise<T>((_, reject) =>
									setTimeout(
										() => reject(new Error("Request timeout")),
										timeoutMs,
									),
								),
							]);
						};

						const issueContents = await Promise.all(
							githubIssues.map(async (issue) => {
								try {
									const content = await fetchWithTimeout(
										utils.client.projects.getIssueContent.query({
											projectId,
											issueNumber: issue.number,
										}),
										10000, // 10 second timeout per issue
									);

									// Sanitize user-generated content to prevent injection
									const sanitizeText = (str: string) =>
										str.replace(/[&<>"']/g, (char) => {
											const entities: Record<string, string> = {
												"&": "&amp;",
												"<": "&lt;",
												">": "&gt;",
												'"': "&quot;",
												"'": "&#39;",
											};
											return entities[char] || char;
										});

									const sanitizeUrl = (url: string) => {
										try {
											const parsed = new URL(url);
											// Only allow http/https protocols
											if (!["http:", "https:"].includes(parsed.protocol)) {
												return "#invalid-url";
											}
											return url;
										} catch {
											return "#invalid-url";
										}
									};

									// Limit body size to prevent memory issues
									const MAX_BODY_LENGTH = 50000; // 50KB
									const truncatedBody =
										content.body.length > MAX_BODY_LENGTH
											? `${content.body.slice(0, MAX_BODY_LENGTH)}\n\n[... content truncated due to length ...]`
											: content.body;

									const markdown = `# GitHub Issue #${content.number}: ${sanitizeText(content.title)}

**URL:** ${sanitizeUrl(content.url)}
**State:** ${content.state}
**Author:** ${sanitizeText(content.author || "Unknown")}
**Created:** ${content.createdAt ? new Date(content.createdAt).toLocaleString() : "Unknown"}
**Updated:** ${content.updatedAt ? new Date(content.updatedAt).toLocaleString() : "Unknown"}

---

${sanitizeText(truncatedBody)}`;

									// Convert markdown to base64 data URL
									const base64 = btoa(
										encodeURIComponent(markdown).replace(
											/%([0-9A-F]{2})/g,
											(_, p1) => String.fromCharCode(Number.parseInt(p1, 16)),
										),
									);

									return {
										data: `data:text/markdown;base64,${base64}`,
										mediaType: "text/markdown",
										filename: `github-issue-${content.number}.md`,
									};
								} catch (err) {
									console.warn(
										`Failed to fetch GitHub issue #${issue.number}:`,
										err,
									);
									return null;
								}
							}),
						);

						// Add successfully fetched issues to convertedFiles
						const validIssueFiles = issueContents.filter(
							(file) => file !== null,
						) as ConvertedFile[];
						convertedFiles = [...convertedFiles, ...validIssueFiles];
					} catch (err) {
						console.warn("Failed to fetch GitHub issue contents:", err);
						// Don't block workspace creation if issue fetching fails
					}
				}

				let launchRequest: AgentLaunchRequest | null = null;
				try {
					launchRequest = buildLaunchRequest(
						trimmedPrompt,
						convertedFiles.length > 0 ? convertedFiles : undefined,
					);
				} catch (error) {
					clearPendingWorkspace(pendingWorkspaceId);
					toast.error(
						error instanceof Error
							? error.message
							: "Не удалось подготовить запуск агента",
					);
					return;
				}

				setPendingWorkspaceStatus(pendingWorkspaceId, "creating");

				if (linkedPR) {
					void runAsyncAction(
						createFromPr.mutateAsyncWithSetup(
							{ projectId, prUrl: linkedPR.url },
							launchRequest ?? undefined,
						),
						{
							loading: `Creating workspace from PR #${linkedPR.prNumber}...`,
							success: "Workspace created from PR",
							error: (err) =>
								err instanceof Error
									? err.message
									: "Failed to create workspace from PR",
						},
						{ closeAndReset: false },
					).finally(() => {
						clearPendingWorkspace(pendingWorkspaceId);
					});
					return;
				}

				void runAsyncAction(
					createWorkspace.mutateAsyncWithPendingSetup(
						{
							projectId,
							name:
								workspaceNameEdited && workspaceName.trim()
									? workspaceName.trim()
									: undefined,
							prompt: trimmedPrompt || undefined,
							branchName:
								(branchNameEdited && branchName.trim()
									? sanitizeBranchNameWithMaxLength(
											branchName.trim(),
											undefined,
											{
												preserveCase: true,
											},
										)
									: aiBranchName) || undefined,
							compareBaseBranch: compareBaseBranch || undefined,
						},
						{
							agentLaunchRequest: launchRequest ?? undefined,
							resolveInitialCommands: runSetupScript
								? (commands) => commands
								: () => null,
						},
					),
					{
						loading: "Creating workspace...",
						success: "Workspace created",
						error: (err) =>
							err instanceof Error
								? err.message
								: "Не удалось создать рабочее пространство",
					},
					{ closeAndReset: false },
				).finally(() => {
					clearPendingWorkspace(pendingWorkspaceId);
				});
			} finally {
				for (const file of detachedFiles) {
					if (file.url?.startsWith("blob:")) {
						URL.revokeObjectURL(file.url);
					}
				}
			}
		},
		[
			attachments,
			compareBaseBranch,
			branchName,
			branchNameEdited,
			buildLaunchRequest,
			closeAndResetDraft,
			clearPendingWorkspace,
			convertBlobUrlToDataUrl,
			createFromPr,
			createWorkspace,
			generateBranchNameMutation,
			linkedIssues,
			linkedPR,
			projectId,
			runAsyncAction,
			runSetupScript,
			setPendingWorkspace,
			setPendingWorkspaceStatus,
			trimmedPrompt,
			utils,
			workspaceName,
			workspaceNameEdited,
		],
	);

	const handlePromptSubmit = useCallback(
		(message: {
			files: Array<{ url: string; mediaType: string; filename?: string }>;
		}) => {
			const converted: ConvertedFile[] = message.files
				.filter((f) => f.url)
				.map((f) => ({
					data: f.url,
					mediaType: f.mediaType,
					filename: f.filename,
				}));
			void handleCreate(converted.length > 0 ? converted : undefined);
		},
		[handleCreate],
	);

	useEffect(() => {
		if (!isNewWorkspaceModalOpen) return;
		const handler = (e: KeyboardEvent) => {
			if (!isEnterSubmit(e, { requireMod: true })) return;
			e.preventDefault();
			void handleCreate();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [isNewWorkspaceModalOpen, handleCreate]);

	return { handleCreate, handlePromptSubmit };
}
