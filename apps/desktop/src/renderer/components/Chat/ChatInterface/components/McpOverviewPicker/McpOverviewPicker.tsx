import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
} from "@rox/ui/ai-elements/model-selector";
import { motion } from "framer-motion";
import { AnimatedHeight, StatusPulse, useShouldAnimate } from "renderer/motion";
import type { McpOverviewPayload, McpServerOverviewItem } from "../../types";

interface McpOverviewPickerProps {
	overview: McpOverviewPayload | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAuthenticateServer?: (serverName: string) => Promise<void> | void;
	authenticatingServerName?: string | null;
}

function getStateClassName(state: McpServerOverviewItem["state"]): string {
	switch (state) {
		case "enabled":
			return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
		case "disabled":
			return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
		default:
			return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
	}
}

function formatStateLabel(state: McpServerOverviewItem["state"]): string {
	switch (state) {
		case "enabled":
			return "Включён";
		case "disabled":
			return "Отключён";
		default:
			return "Недействителен";
	}
}

function formatTransportLabel(
	transport: McpServerOverviewItem["transport"],
): string {
	switch (transport) {
		case "remote":
			return "Удалённый";
		case "local":
			return "Локальный";
		default:
			return "Неизвестно";
	}
}

export function McpOverviewPicker({
	overview,
	open,
	onOpenChange,
	onAuthenticateServer,
	authenticatingServerName,
}: McpOverviewPickerProps) {
	const servers = overview?.servers ?? [];
	const shouldAnimate = useShouldAnimate("decorative");

	return (
		<ModelSelector open={open} onOpenChange={onOpenChange}>
			<ModelSelectorContent className="max-w-2xl" title="MCP Servers">
				<div className="border-b border-border/60 px-4 py-3">
					<div className="text-sm font-medium text-foreground">
						MCP Servers ({servers.length})
					</div>
					<div className="mt-1 truncate text-xs text-muted-foreground">
						{overview?.sourcePath
							? `Loaded from ${overview.sourcePath}`
							: "В этом рабочем пространстве не найдена конфигурация MCP"}
					</div>
				</div>
				<ModelSelectorInput placeholder="Поиск серверов MCP..." />
				<ModelSelectorList className="max-h-[420px]">
					<ModelSelectorEmpty>Серверы MCP не настроены.</ModelSelectorEmpty>
					<ModelSelectorGroup heading="Серверы">
						{servers.map((server) => (
							<ModelSelectorItem
								key={server.name}
								value={`${server.name} ${server.target} ${server.transport} ${server.state} ${server.error ?? ""}`}
								onSelect={() => {
									if (
										!onAuthenticateServer ||
										server.transport !== "remote" ||
										server.state === "disabled"
									) {
										return;
									}
									void onAuthenticateServer(server.name);
								}}
							>
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-medium text-foreground">
										{server.name}
									</div>
									<div className="truncate text-xs text-muted-foreground">
										{server.target}
									</div>
									<AnimatedHeight open={Boolean(server.error)}>
										<div className="truncate text-xs text-destructive">
											{server.error}
										</div>
									</AnimatedHeight>
								</div>
								<div className="ml-3 flex shrink-0 items-center gap-1.5">
									{server.connected === true ? (
										<StatusPulse
											active={shouldAnimate && server.connected === true}
										>
											<span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
												Connected
											</span>
										</StatusPulse>
									) : server.connected === false ? (
										<span className="rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
											Disconnected
										</span>
									) : null}
									<span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
										{formatTransportLabel(server.transport)}
									</span>
									<span
										className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStateClassName(server.state)}`}
									>
										{formatStateLabel(server.state)}
									</span>
									{onAuthenticateServer &&
									server.transport === "remote" &&
									server.state !== "disabled" ? (
										<span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground">
											{authenticatingServerName === server.name ? (
												<motion.span
													aria-hidden
													className="inline-block size-3 rounded-full border border-current border-t-transparent"
													animate={shouldAnimate ? { rotate: 360 } : undefined}
													transition={{
														repeat: Infinity,
														ease: "linear",
														duration: 0.8,
													}}
												/>
											) : null}
											{authenticatingServerName === server.name
												? "Подключение..."
												: server.connected
													? "Переавторизация"
													: "Авторизация"}
										</span>
									) : null}
								</div>
							</ModelSelectorItem>
						))}
					</ModelSelectorGroup>
				</ModelSelectorList>
			</ModelSelectorContent>
		</ModelSelector>
	);
}
