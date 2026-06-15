import { COMPANY } from "@rox/shared/constants";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import { createFileRoute } from "@tanstack/react-router";
import { Fragment } from "react";
import { LuBookOpen, LuExternalLink, LuTerminal } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { CopyableCommand } from "./components/CopyableCommand";
import {
	CLI_COMMAND_GROUPS,
	PREINSTALLED_MCP_SERVERS,
	PREINSTALLED_SKILLS,
	SLASH_COMMANDS,
} from "./data";

export const Route = createFileRoute("/_authenticated/_dashboard/cli/")({
	component: CliReferencePage,
});

function CliReferencePage() {
	const openUrlMutation = electronTrpc.external.openUrl.useMutation();
	const openExternal = (url: string) => openUrlMutation.mutate(url);

	return (
		<div className="flex-1 overflow-y-auto">
			<div className="mx-auto flex max-w-4xl flex-col gap-10 px-8 py-10">
				{/* Header */}
				<header className="flex flex-col gap-3">
					<div className="flex size-10 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-sm">
						<LuTerminal className="size-5" />
					</div>
					<h1 className="text-xl font-semibold tracking-tight">
						Начало работы
					</h1>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						Rox поставляется с CLI{" "}
						<code className="select-text cursor-text rounded bg-muted px-1 py-0.5 font-mono text-[13px]">
							rox
						</code>
						, набором предустановленных MCP-серверов и навыков. CLI доступен в
						каждом терминале Rox — просто введите команду ниже или попросите
						агента воспользоваться ей.
					</p>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-8 gap-1.5"
							onClick={() => openExternal(COMPANY.DOCS_URL)}
						>
							<LuBookOpen className="size-4" />
							Полная документация
							<LuExternalLink className="size-3.5 opacity-60" />
						</Button>
					</div>
				</header>

				{/* CLI reference */}
				<section className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<h2 className="text-base font-semibold tracking-tight">
							Справочник по CLI
						</h2>
						<p className="text-sm text-muted-foreground">
							Основные команды для создания рабочих пространств, запуска задач и
							управления автоматизациями.
						</p>
					</div>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						{CLI_COMMAND_GROUPS.map((group) => (
							<Card key={group.id} className="gap-3 py-4">
								<CardHeader>
									<CardTitle className="text-sm">{group.label}</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2.5">
									{group.commands.map((cmd) => (
										<div key={cmd.command} className="flex flex-col gap-1">
											<CopyableCommand command={cmd.command} />
											<p className="px-1 text-xs leading-relaxed text-muted-foreground">
												{cmd.description}
											</p>
										</div>
									))}
								</CardContent>
							</Card>
						))}
					</div>
				</section>

				{/* Slash commands */}
				<section className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<h2 className="text-base font-semibold tracking-tight">
							Команды агента
						</h2>
						<p className="text-sm text-muted-foreground">
							Слэш-команды для чата с агентом — введите их прямо в диалоге.
						</p>
					</div>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						{SLASH_COMMANDS.map((slash) => (
							<Card key={slash.command} className="gap-3 py-4">
								<CardHeader>
									<CardTitle className="font-mono text-sm">
										{slash.command}
									</CardTitle>
									<CardDescription className="text-xs leading-relaxed">
										{slash.description}
									</CardDescription>
								</CardHeader>
								<CardContent>
									<CopyableCommand command={slash.example} />
								</CardContent>
							</Card>
						))}
					</div>
				</section>

				{/* Preinstalled MCP servers */}
				<section className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<h2 className="text-base font-semibold tracking-tight">
							Предустановленные MCP-серверы
						</h2>
						<p className="text-sm text-muted-foreground">
							Доступны на вкладке MCP в каждом новом рабочем пространстве.
						</p>
					</div>
					<div className="flex flex-col divide-y divide-border rounded-lg border border-border">
						{PREINSTALLED_MCP_SERVERS.map((server) => (
							<div
								key={server.name}
								className="flex items-center justify-between gap-3 px-4 py-3"
							>
								<div className="flex min-w-0 flex-col gap-0.5">
									<span className="font-mono text-sm text-foreground">
										{server.name}
									</span>
									<span className="text-xs leading-relaxed text-muted-foreground">
										{server.description}
									</span>
								</div>
								<Badge
									variant={server.requires ? "outline" : "secondary"}
									className="shrink-0"
								>
									{server.requires ? `Нужен ${server.requires}` : "Готово"}
								</Badge>
							</div>
						))}
					</div>
				</section>

				{/* Preinstalled skills */}
				<section className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<h2 className="text-base font-semibold tracking-tight">
							Предустановленные навыки
						</h2>
						<p className="text-sm text-muted-foreground">
							Появляются на вкладке Навыки наряду с встроенным каталогом.
						</p>
					</div>
					<div className="flex flex-col divide-y divide-border rounded-lg border border-border">
						{PREINSTALLED_SKILLS.map((skill) => (
							<Fragment key={skill.name}>
								<div className="flex items-center justify-between gap-3 px-4 py-3">
									<div className="flex min-w-0 flex-col gap-0.5">
										<span className="font-mono text-sm text-foreground">
											{skill.name}
										</span>
										<span className="text-xs leading-relaxed text-muted-foreground">
											{skill.description}
										</span>
									</div>
									<button
										type="button"
										onClick={() => openExternal(`https://${skill.repo}`)}
										className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
									>
										{skill.repo}
										<LuExternalLink className="size-3" />
									</button>
								</div>
							</Fragment>
						))}
					</div>
				</section>
			</div>
		</div>
	);
}
