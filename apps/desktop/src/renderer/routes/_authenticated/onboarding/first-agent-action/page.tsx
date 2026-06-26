import { Button } from "@rox/ui/button";
import { Card } from "@rox/ui/card";
import { Input } from "@rox/ui/input";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuCircleCheck, LuCopy } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { logger } from "renderer/lib/logger";
import {
	getActivationDraft,
	rememberActivationWorkspace,
} from "../onboarding-progress";

export const Route = createFileRoute(
	"/_authenticated/onboarding/first-agent-action/",
)({
	component: OnboardingFirstAgentActionPage,
});

const SUGGESTED_FIRST_AGENT_PROMPT =
	"Прочитай проект и верни короткий план: что здесь главное, где начать, какой первый маленький шаг улучшит проект.";

function OnboardingFirstAgentActionPage() {
	const navigate = useNavigate();
	const { refetch: refetchSession } = authClient.useSession();
	const [workspaceId, setWorkspaceId] = useState(
		getActivationDraft().workspaceId ?? "",
	);
	const [busy, setBusy] = useState(false);

	const completeActivation = async () => {
		const trimmedWorkspaceId = workspaceId.trim();
		if (trimmedWorkspaceId) {
			rememberActivationWorkspace(trimmedWorkspaceId);
		}
		setBusy(true);
		try {
			const draft = getActivationDraft();
			await apiTrpcClient.user.completeActivation.mutate({
				projectId: draft.projectId ?? undefined,
				workspaceId: trimmedWorkspaceId || draft.workspaceId || undefined,
				completionSource: "manual_first_agent_confirmation",
			});
			await refetchSession({ query: { disableCookieCache: true } });
			await navigate({ to: "/v2-workspaces", replace: true });
		} catch (error) {
			logger.error("[onboarding] completeActivation failed", error);
			toast.error("Не удалось завершить активацию. Попробуйте ещё раз.");
			setBusy(false);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<Card className="gap-4 p-5">
				<div className="flex items-start gap-4">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
						<LuCircleCheck className="size-4.5" />
					</div>
					<div className="min-w-0 flex-1 space-y-2">
						<p className="text-sm font-medium text-foreground">
							Отправьте первый запрос агенту
						</p>
						<p className="text-xs text-muted-foreground">
							После первого ответа Rox считает активацию завершенной.
						</p>
					</div>
				</div>
				<Textarea
					value={SUGGESTED_FIRST_AGENT_PROMPT}
					readOnly
					className="min-h-24 resize-none text-sm"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							void navigator.clipboard.writeText(SUGGESTED_FIRST_AGENT_PROMPT);
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
						Подтвердите первый ответ
					</p>
					<p className="text-xs text-muted-foreground">
						Если автоматический сигнал ответа ещё не подключен, используйте
						ручное подтверждение.
					</p>
				</div>
				<Input
					type="text"
					value={workspaceId}
					onChange={(event) => setWorkspaceId(event.target.value)}
					placeholder="workspace id, если есть"
				/>
				<Button
					type="button"
					onClick={completeActivation}
					disabled={busy}
					className="self-start"
				>
					{busy ? "Завершение…" : "Я получил первый ответ"}
				</Button>
			</Card>
		</div>
	);
}
