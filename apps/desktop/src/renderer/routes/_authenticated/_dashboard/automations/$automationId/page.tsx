import type { SelectAutomation, SelectAutomationRun } from "@rox/db/schema";
import { alert } from "@rox/ui/atoms/Alert";
import { toast } from "@rox/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { AutomationBody } from "./components/AutomationBody";
import { AutomationDetailHeader } from "./components/AutomationDetailHeader";
import { AutomationDetailSidebar } from "./components/AutomationDetailSidebar";
import { VersionHistorySheet } from "./components/VersionHistorySheet";

type AutomationDetailSearch = {
	history?: boolean;
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/automations/$automationId/",
)({
	component: AutomationDetailPage,
	validateSearch: (
		search: Record<string, unknown>,
	): AutomationDetailSearch => ({
		history: search.history === true,
	}),
});

const RECENT_RUNS_LIMIT = 10;

function AutomationDetailPage() {
	const { automationId } = Route.useParams();
	const { history } = Route.useSearch();
	const navigate = useNavigate();
	const collections = useCollections();
	const [historyOpen, setHistoryOpen] = useState(history ?? false);

	const { data: automationRows, isReady: automationReady } = useLiveQuery(
		(q) =>
			q
				.from({ a: collections.automations })
				.where(({ a }) => eq(a.id, automationId))
				.select(({ a }) => ({ ...a })),
		[collections.automations, automationId],
	);
	const automation = automationRows?.[0] as SelectAutomation | undefined;

	const { data: runRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ r: collections.automationRuns })
				.where(({ r }) => eq(r.automationId, automationId))
				.orderBy(({ r }) => r.createdAt, "desc")
				.limit(RECENT_RUNS_LIMIT)
				.select(({ r }) => ({ ...r })),
		[collections.automationRuns, automationId],
	);
	const recentRuns = runRows as SelectAutomationRun[];

	const setEnabledMutation = useMutation({
		mutationFn: (enabled: boolean) =>
			apiTrpcClient.automation.setEnabled.mutate({ id: automationId, enabled }),
	});

	const runNowMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.runNow.mutate({ id: automationId }),
	});

	const deleteMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.delete.mutate({ id: automationId }),
		onSuccess: () => navigate({ to: "/automations" }),
	});

	if (!automation) {
		if (!automationReady) return null;
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground select-text cursor-text">
				Автоматизация не найдена.
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-1 overflow-hidden">
			<div className="flex flex-1 flex-col overflow-hidden">
				<AutomationDetailHeader
					name={automation.name}
					enabled={automation.enabled}
					onBack={() => navigate({ to: "/automations" })}
					onToggleEnabled={() => setEnabledMutation.mutate(!automation.enabled)}
					onDelete={() => {
						alert({
							title: "Удалить автоматизацию?",
							description: `«${automation.name}» перестанет срабатывать, а история её запусков будет удалена. Это действие нельзя отменить.`,
							actions: [
								{ label: "Отмена", variant: "outline", onClick: () => {} },
								{
									label: "Удалить",
									variant: "destructive",
									onClick: () => {
										toast.promise(deleteMutation.mutateAsync(), {
											loading: "Удаление автоматизации...",
											success: `«${automation.name}» удалена`,
											error: (err) =>
												err instanceof Error
													? err.message
													: "Не удалось удалить автоматизацию",
										});
									},
								},
							],
						});
					}}
					onRunNow={() => runNowMutation.mutate()}
					onOpenHistory={() => setHistoryOpen(true)}
					toggleDisabled={setEnabledMutation.isPending}
					deleteDisabled={deleteMutation.isPending}
					runNowDisabled={runNowMutation.isPending}
				/>

				<AutomationBody key={automation.id} automation={automation} />
			</div>

			<AutomationDetailSidebar
				automation={automation}
				recentRuns={recentRuns}
			/>

			<VersionHistorySheet
				key={automation.id}
				automationId={automation.id}
				automationName={automation.name}
				currentPrompt={automation.prompt}
				open={historyOpen}
				onOpenChange={setHistoryOpen}
			/>
		</div>
	);
}
