import { Button } from "@rox/ui/button";
import { Card } from "@rox/ui/card";
import { Input } from "@rox/ui/input";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiArrowRight } from "react-icons/hi2";
import { LuCopy, LuMessageSquarePlus } from "react-icons/lu";
import { logger } from "renderer/lib/logger";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import {
	completeActivationStep,
	getActivationDraft,
	recordActivationCurrentStep,
	rememberActivationWorkspace,
} from "../onboarding-progress";

export const Route = createFileRoute("/_authenticated/onboarding/workspace/")({
	component: OnboardingWorkspacePage,
});

const SUGGESTED_FIRST_WORKSPACE_PROMPT =
	"Разобраться, что делает проект, и предложить первый маленький улучшенный шаг.";

function OnboardingWorkspacePage() {
	const navigate = useNavigate();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const [workspaceId, setWorkspaceId] = useState(
		getActivationDraft().workspaceId ?? "",
	);
	const [busy, setBusy] = useState(false);

	const openWorkspaceModal = async () => {
		const { projectId } = getActivationDraft();
		setBusy(true);
		try {
			await recordActivationCurrentStep("workspace", {
				projectId,
				workspaceId: workspaceId.trim() || null,
			});
			useNewWorkspaceDraftStore.getState().updateDraft({
				selectedProjectId: projectId ?? null,
				prompt: SUGGESTED_FIRST_WORKSPACE_PROMPT,
			});
			openNewWorkspaceModal(projectId ?? undefined);
			toast.info("Создайте workspace в открытом окне. Затем продолжите здесь.");
		} catch (error) {
			logger.error("[onboarding] workspace progress failed", error);
			toast.error("Не удалось сохранить шаг. Попробуйте ещё раз.");
		} finally {
			setBusy(false);
		}
	};

	const continueManually = async () => {
		const trimmedWorkspaceId = workspaceId.trim();
		if (trimmedWorkspaceId) {
			rememberActivationWorkspace(trimmedWorkspaceId);
		}
		setBusy(true);
		try {
			if (trimmedWorkspaceId) {
				await completeActivationStep("workspace", {
					projectId: getActivationDraft().projectId,
					workspaceId: trimmedWorkspaceId,
				});
			} else {
				await recordActivationCurrentStep("workspace", {
					projectId: getActivationDraft().projectId,
				});
			}
		} catch (error) {
			logger.error("[onboarding] manual workspace progress failed", error);
			toast.error("Не удалось сохранить workspace. Попробуйте ещё раз.");
			setBusy(false);
			return;
		}
		setBusy(false);
		await navigate({ to: "/onboarding/first-agent-action" });
	};

	return (
		<div className="flex flex-col gap-4">
			<Card className="gap-4 p-5">
				<div className="flex items-start gap-4">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
						<LuMessageSquarePlus className="size-4.5" />
					</div>
					<div className="min-w-0 flex-1 space-y-2">
						<p className="text-sm font-medium text-foreground">
							Создайте workspace с первым заданием
						</p>
						<p className="text-xs text-muted-foreground">
							Workspace хранит задачу, ветку, терминал, чат, изменения и PR
							вместе.
						</p>
					</div>
				</div>
				<Textarea
					value={SUGGESTED_FIRST_WORKSPACE_PROMPT}
					readOnly
					className="min-h-20 resize-none text-sm"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Button type="button" onClick={openWorkspaceModal} disabled={busy}>
						Открыть создание workspace
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							void navigator.clipboard.writeText(
								SUGGESTED_FIRST_WORKSPACE_PROMPT,
							);
							toast.success("Prompt скопирован.");
						}}
					>
						<LuCopy />
						Скопировать prompt
					</Button>
				</div>
			</Card>

			<Card className="gap-3 p-5">
				<div className="space-y-1">
					<p className="text-sm font-medium text-foreground">
						Если workspace уже создан
					</p>
					<p className="text-xs text-muted-foreground">
						Вставьте id из адреса `/v2-workspace/...` или продолжите без id.
						Автоматический callback из modal пока не доступен.
					</p>
				</div>
				<Input
					type="text"
					value={workspaceId}
					onChange={(event) => setWorkspaceId(event.target.value)}
					placeholder="workspace id"
				/>
				<Button
					type="button"
					variant="secondary"
					onClick={continueManually}
					disabled={busy}
					className="self-start"
				>
					Перейти к первому ответу
					<HiArrowRight />
				</Button>
			</Card>
		</div>
	);
}
