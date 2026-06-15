import type { HostAgentConfig } from "@rox/host-service/settings";
import { ODW_OMP_HARNESS_ID } from "@rox/shared/agent-harness-presets";
import type { PromptTransport } from "@rox/shared/agent-prompt-launch";
import { DEFAULT_TERMINAL_AGENT_TYPE } from "@rox/shared/agent-settings";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { cn } from "@rox/ui/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { AgentHarnessStatusBadge } from "renderer/components/AgentHarnessStatusBadge";
import {
	AGENT_PREINSTALL_STATUS_QUERY_KEY,
	getOmpOdwHarnessEntry,
	getOmpOdwHarnessState,
	useAgentPreinstallStatus,
} from "renderer/hooks/useAgentPreinstallStatus";
import {
	getAgentCommandText,
	isAgentCommandPatchChanged,
	parseAgentCommandText,
} from "renderer/lib/agent-launch-command";
import { joinArgs, parseArgs } from "renderer/lib/argv";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface AgentDetailProps {
	config: HostAgentConfig;
	description: string;
	onChanged: (updated: HostAgentConfig) => void;
	onDeleted: () => void;
}

export function AgentDetail({
	config,
	description,
	onChanged,
	onDeleted,
}: AgentDetailProps) {
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const queryClient = useQueryClient();
	const isDark = useIsDarkTheme();
	const icon = getPresetIcon(config.presetId, isDark);
	const preinstallStatusQuery = useAgentPreinstallStatus(activeHostUrl);
	const odwHarnessEntry = getOmpOdwHarnessEntry(preinstallStatusQuery.data);
	const odwHarnessState = getOmpOdwHarnessState(odwHarnessEntry);
	const showOdwHarness = config.presetId === DEFAULT_TERMINAL_AGENT_TYPE;
	const isDefaultAgent = config.presetId === DEFAULT_TERMINAL_AGENT_TYPE;

	const [label, setLabel] = useState(config.label);
	const [commandText, setCommandText] = useState(getAgentCommandText(config));
	const [promptArgsText, setPromptArgsText] = useState(
		joinArgs(config.promptArgs),
	);
	const [promptTransport, setPromptTransport] = useState<PromptTransport>(
		config.promptTransport,
	);

	useEffect(() => {
		setLabel(config.label);
		setCommandText(
			getAgentCommandText({
				command: config.command,
				args: config.args,
				env: config.env,
			}),
		);
		setPromptArgsText(joinArgs(config.promptArgs));
		setPromptTransport(config.promptTransport);
	}, [
		config.label,
		config.command,
		config.args,
		config.env,
		config.promptArgs,
		config.promptTransport,
	]);

	const updateMutation = useMutation({
		mutationFn: (
			patch: Parameters<
				ReturnType<
					typeof getHostServiceClientByUrl
				>["settings"]["agentConfigs"]["update"]["mutate"]
			>[0]["patch"],
		) => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: "сохранить агента",
					}),
				);
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.update.mutate({ id: config.id, patch });
		},
		onSuccess: (updated) => onChanged(updated),
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Не удалось сохранить"),
	});

	const removeMutation = useMutation({
		mutationFn: () => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: "удалить агента",
					}),
				);
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.remove.mutate({ id: config.id });
		},
		onSuccess: () => onDeleted(),
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Не удалось удалить"),
	});

	const odwHarnessMutation = useMutation({
		mutationFn: async (enabled: boolean) => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: "изменить ODW harness",
					}),
				);
			}
			const client = getHostServiceClientByUrl(activeHostUrl);
			if (enabled) {
				return client.settings.agentPreinstall.retry.mutate({
					presetId: ODW_OMP_HARNESS_ID,
				});
			}

			const result = await client.settings.agentPreinstall.skip.mutate({
				presetId: ODW_OMP_HARNESS_ID,
			});
			if (!result.skipped) {
				throw new Error("ODW harness preset is not available on this host");
			}
			return result;
		},
		onSuccess: (_result, enabled) => {
			toast.success(
				enabled ? "ODW harness включается" : "ODW harness выключен",
			);
			void queryClient.invalidateQueries({
				queryKey: AGENT_PREINSTALL_STATUS_QUERY_KEY,
			});
			void queryClient.refetchQueries({
				queryKey: AGENT_PREINSTALL_STATUS_QUERY_KEY,
			});
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Не удалось изменить ODW harness",
			),
	});

	const handleLabelBlur = () => {
		if (label !== config.label && label.trim().length > 0) {
			updateMutation.mutate({ label });
		}
	};

	const handleCommandBlur = () => {
		const patch = parseAgentCommandText(commandText);
		const { command } = patch;
		if (command.length === 0) {
			toast.error("Команда не может быть пустой");
			setCommandText(getAgentCommandText(config));
			return;
		}
		if (isAgentCommandPatchChanged(config, patch)) {
			updateMutation.mutate(patch);
		}
	};

	const handlePromptArgsBlur = () => {
		const args = parseArgs(promptArgsText);
		const changed =
			args.length !== config.promptArgs.length ||
			args.some((arg, i) => arg !== config.promptArgs[i]);
		if (changed) updateMutation.mutate({ promptArgs: args });
	};

	const handleTransportChange = (next: PromptTransport) => {
		if (next === promptTransport) return;
		const prev = promptTransport;
		setPromptTransport(next);
		updateMutation.mutate(
			{ promptTransport: next },
			{ onError: () => setPromptTransport(prev) },
		);
	};

	return (
		<div className="p-6 max-w-3xl w-full mx-auto">
			<div className="mb-8 flex items-center gap-3">
				{icon ? (
					<img src={icon} alt="" className="size-8 object-contain shrink-0" />
				) : null}
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						<h2 className="truncate text-xl font-semibold">{config.label}</h2>
						{isDefaultAgent ? (
							<span className="shrink-0 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
								по умолчанию
							</span>
						) : null}
					</div>
					<p className="text-sm text-muted-foreground mt-0.5 truncate">
						{description}
					</p>
				</div>
			</div>

			<div className="space-y-6">
				<Section title="Название">
					<Input
						id={`label-${config.id}`}
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						onBlur={handleLabelBlur}
					/>
				</Section>

				<Section title="Запуск">
					<StackedField
						label="Команда"
						hint="Argv, используемый для запуска агента."
						htmlFor={`command-${config.id}`}
					>
						<Input
							id={`command-${config.id}`}
							className="font-mono text-xs"
							value={commandText}
							onChange={(e) => setCommandText(e.target.value)}
							onBlur={handleCommandBlur}
							placeholder="claude --dangerously-skip-permissions"
						/>
					</StackedField>

					<StackedField
						label="Аргументы только для промпта"
						hint={
							<>
								Добавляются только при запуске с промптом — например{" "}
								<code>--</code>, <code>--prompt</code>, <code>-i</code>.
							</>
						}
						htmlFor={`prompt-args-${config.id}`}
					>
						<Input
							id={`prompt-args-${config.id}`}
							className="font-mono text-xs"
							value={promptArgsText}
							onChange={(e) => setPromptArgsText(e.target.value)}
							onBlur={handlePromptArgsBlur}
							placeholder="--prompt"
						/>
					</StackedField>

					<StackedField
						label="Доставка промпта"
						hint="Как Rox передает текст задачи агенту при запуске."
					>
						<div className="inline-flex rounded-md border border-border overflow-hidden">
							<button
								type="button"
								onClick={() => handleTransportChange("argv")}
								className={cn(
									"px-3 py-1 text-xs font-medium transition-colors",
									promptTransport === "argv"
										? "bg-accent text-accent-foreground"
										: "bg-transparent text-muted-foreground hover:bg-accent/50",
								)}
							>
								argv
							</button>
							<button
								type="button"
								onClick={() => handleTransportChange("stdin")}
								className={cn(
									"px-3 py-1 text-xs font-medium transition-colors border-l border-border",
									promptTransport === "stdin"
										? "bg-accent text-accent-foreground"
										: "bg-transparent text-muted-foreground hover:bg-accent/50",
								)}
							>
								stdin
							</button>
						</div>
						<div className="grid gap-2 pt-2 text-xs text-muted-foreground sm:grid-cols-2">
							<p>
								<span className="font-medium text-foreground">argv</span>{" "}
								добавляет промпт к аргументам команды. Это удобно для CLI с
								флагами вроде <code>-p</code> или <code>--prompt</code>.
							</p>
							<p>
								<span className="font-medium text-foreground">stdin</span>{" "}
								передает промпт во входной поток процесса. Это лучше для
								длинного текста и агентов, которые читают интерактивный ввод.
							</p>
						</div>
					</StackedField>
				</Section>

				{showOdwHarness && (
					<Section
						title="Workflow harness"
						action={<AgentHarnessStatusBadge entry={odwHarnessEntry} />}
					>
						<div className="flex items-center justify-between gap-6 rounded-md border border-border bg-muted/30 px-3 py-3">
							<div className="min-w-0 flex-1">
								<div className="text-sm font-medium">
									Open Dynamic Workflows
								</div>
								<p className="mt-0.5 text-xs text-muted-foreground">
									Additive Rox workflow layer: ODW готовит workflow-контекст, а
									запуск агента остается через Rox/omp.
								</p>
								{odwHarnessEntry?.lastError ? (
									<p className="mt-2 line-clamp-2 text-xs text-destructive">
										{odwHarnessEntry.lastError}
									</p>
								) : null}
							</div>
							<Switch
								aria-label="Toggle Open Dynamic Workflows harness"
								checked={
									odwHarnessState === "ready" ||
									odwHarnessState === "installing"
								}
								disabled={
									!activeHostUrl ||
									odwHarnessMutation.isPending ||
									odwHarnessState === "installing"
								}
								onCheckedChange={(checked) =>
									odwHarnessMutation.mutate(checked)
								}
							/>
						</div>
					</Section>
				)}

				<div className="pt-2 border-t border-border">
					<div className="flex items-center justify-between gap-8">
						<div className="min-w-0 flex-1">
							<div className="text-sm font-medium">Удалить агента</div>
							<p className="text-sm text-muted-foreground mt-0.5">
								Удаляет этого агента только с этого устройства.
							</p>
						</div>
						<Button
							variant="destructive"
							size="sm"
							onClick={() => removeMutation.mutate()}
							disabled={removeMutation.isPending}
							className="shrink-0 gap-1.5"
						>
							<Trash2 className="size-3.5" />
							Удалить
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

function Section({
	title,
	description,
	action,
	children,
}: {
	title: string;
	description?: string;
	action?: React.ReactNode;
	children?: React.ReactNode;
}) {
	return (
		<section className="space-y-3">
			<div className="flex items-start justify-between gap-6">
				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-medium">{title}</h3>
					{description && (
						<p className="text-xs text-muted-foreground mt-0.5">
							{description}
						</p>
					)}
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
			{children ? <div className="space-y-5">{children}</div> : null}
		</section>
	);
}

interface StackedFieldProps {
	label: string;
	hint?: React.ReactNode;
	htmlFor?: string;
	children: React.ReactNode;
}

function StackedField({ label, hint, htmlFor, children }: StackedFieldProps) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={htmlFor} className="text-sm font-medium">
				{label}
			</Label>
			{hint && <p className="text-xs text-muted-foreground -mt-1">{hint}</p>}
			{children}
		</div>
	);
}
