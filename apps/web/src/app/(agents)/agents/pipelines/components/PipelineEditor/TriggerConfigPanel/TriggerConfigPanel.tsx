"use client";

import type { TriggerKind } from "@rox/db/enums";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Label } from "@rox/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";

/**
 * User-facing pipeline trigger kinds. Each maps to the canonical `trigger_kind`
 * pgEnum value the cross-run dispatcher recognizes (see
 * `triggerKindToEventKind`). The sixth product trigger,
 * `all_prior_agents_finished`, is a native graph JOIN — not an event — so it is
 * intentionally absent here.
 */
const TRIGGER_KIND_OPTIONS: { value: TriggerKind; label: string }[] = [
	{ value: "chat", label: "Пользователь отправил сообщение" },
	{ value: "agent_run_finished", label: "Агент завершил работу" },
	{ value: "project_initialized", label: "Проект создан" },
	{ value: "file_uploaded", label: "Файл / артефакт создан" },
	{ value: "service_connected", label: "Сервис / навык подключён" },
];

function triggerKindLabel(kind: string): string {
	return TRIGGER_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

type TriggerConfigPanelProps = {
	pipelineId: string;
	/** The selected node id (triggers bind to a node). Null = no node selected. */
	selectedNodeId: string | null;
	/** Label of the selected node, for display. */
	selectedNodeLabel: string | null;
};

/**
 * Per-node trigger configuration. Binds an event kind → the selected pipeline
 * node via the `pipelineTrigger` router (the `pipeline_triggers` registry the
 * cross-run dispatcher reads). Lists existing triggers for the node, lets the
 * user add/enable/disable/delete them.
 *
 * Cache-first (AGENTS.md rule 9): existing trigger rows render immediately.
 */
export function TriggerConfigPanel({
	pipelineId,
	selectedNodeId,
	selectedNodeLabel,
}: TriggerConfigPanelProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [pendingKind, setPendingKind] = useState<TriggerKind>("chat");

	const listInput = { pipelineId };
	const triggersQuery = useQuery(
		trpc.pipelineTrigger.list.queryOptions(listInput),
	);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.pipelineTrigger.list.queryKey(listInput),
		});

	const createMutation = useMutation(
		trpc.pipelineTrigger.create.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Триггер добавлен");
			},
			onError: (error) => {
				console.error("[TriggerConfigPanel] create failed", error);
				toast.error("Не удалось добавить триггер");
			},
		}),
	);

	const setEnabledMutation = useMutation(
		trpc.pipelineTrigger.setEnabled.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => {
				console.error("[TriggerConfigPanel] setEnabled failed", error);
				toast.error("Не удалось изменить триггер");
			},
		}),
	);

	const deleteMutation = useMutation(
		trpc.pipelineTrigger.delete.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Триггер удалён");
			},
			onError: (error) => {
				console.error("[TriggerConfigPanel] delete failed", error);
				toast.error("Не удалось удалить триггер");
			},
		}),
	);

	const allTriggers = triggersQuery.data ?? [];
	const nodeTriggers = selectedNodeId
		? allTriggers.filter((t) => t.nodeId === selectedNodeId)
		: [];

	if (!selectedNodeId) {
		return (
			<div className="flex h-full flex-col gap-3 p-3">
				<h2 className="text-sm font-medium">Триггеры</h2>
				<p className="text-xs text-muted-foreground">
					Выберите узел на холсте, чтобы настроить его триггеры запуска.
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<div>
				<h2 className="text-sm font-medium">Триггеры узла</h2>
				<p className="truncate text-xs text-muted-foreground">
					{selectedNodeLabel ?? selectedNodeId}
				</p>
			</div>

			<div className="flex flex-col gap-2 rounded-md border bg-card p-2">
				<Label className="text-xs">Добавить триггер</Label>
				<Select
					value={pendingKind}
					onValueChange={(v) => setPendingKind(v as TriggerKind)}
				>
					<SelectTrigger className="h-8 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TRIGGER_KIND_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					size="sm"
					disabled={createMutation.isPending}
					onClick={() =>
						createMutation.mutate({
							pipelineId,
							nodeId: selectedNodeId,
							triggerKind: pendingKind,
							matchConfig: {},
							enabled: true,
						})
					}
				>
					<Zap className="size-3.5" /> Привязать
				</Button>
			</div>

			<div className="flex flex-1 flex-col gap-2 overflow-y-auto">
				{nodeTriggers.length === 0 &&
					!triggersQuery.isLoading &&
					selectedNodeId && (
						<p className="text-xs text-muted-foreground">
							У этого узла пока нет триггеров.
						</p>
					)}
				{nodeTriggers.map((trigger) => (
					<div
						key={trigger.id}
						className="flex items-center gap-2 rounded-md border bg-card p-2"
					>
						<Badge variant="secondary" className="text-[10px]">
							{triggerKindLabel(trigger.triggerKind)}
						</Badge>
						<div className="flex-1" />
						<Switch
							checked={trigger.enabled}
							aria-label="Включён"
							onCheckedChange={(enabled) =>
								setEnabledMutation.mutate({ triggerId: trigger.id, enabled })
							}
						/>
						<Button
							size="icon"
							variant="ghost"
							className="size-7"
							aria-label="Удалить триггер"
							onClick={() => deleteMutation.mutate({ triggerId: trigger.id })}
						>
							<Trash2 className="size-4" />
						</Button>
					</div>
				))}
			</div>
		</div>
	);
}
