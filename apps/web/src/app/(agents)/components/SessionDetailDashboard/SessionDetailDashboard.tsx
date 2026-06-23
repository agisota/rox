import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@rox/ui/card";
import { ArrowLeft, Folder, Hash, Route, Terminal } from "lucide-react";
import Link from "next/link";
import type { SessionDashboardDetail } from "../../agents/session-dashboard";
import { SessionObjectLinkGateClient } from "../../agents/sessions/components/SessionObjectLink";
import { SessionActivityFeed } from "../SessionActivityFeed";

export function SessionDetailDashboard({
	session,
}: {
	session: SessionDashboardDetail;
}) {
	const maxTokenUsage = Math.max(
		session.tokenUsage.input,
		session.tokenUsage.output,
		session.tokenUsage.ratio,
		1,
	);
	const legendByTool = new Map(
		session.toolSequence.legend.map((item) => [item.toolName, item]),
	);

	return (
		<main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:px-6">
			<Button asChild variant="ghost" className="w-fit px-0">
				<Link href="/agents">
					<ArrowLeft className="size-4" />
					Назад к кабинету
				</Link>
			</Button>

			<section className="rounded-lg border border-violet-500/30 bg-card p-5">
				<div className="flex flex-col gap-4">
					<div className="flex min-w-0 items-center gap-3">
						<span className="size-2 rounded-full bg-emerald-500" />
						<h1 className="truncate font-mono text-2xl font-semibold md:text-3xl">
							{session.id}
						</h1>
					</div>
					<div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
						<Folder className="size-4" />
						<span className="truncate">{session.workingDirectory}</span>
					</div>
					<div className="rounded-md border bg-muted px-3 py-2 font-mono text-sm text-muted-foreground">
						$ {session.resumeCommand}
					</div>
				</div>
			</section>

			<Card className="rounded-lg">
				<CardHeader>
					<CardTitle className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
						Overview
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-3">
						<OverviewItem label="Model" value={session.overview.model} />
						<OverviewItem
							label="Started at"
							value={formatDateTime(session.overview.startedAt)}
						/>
						<OverviewItem
							label="Last message"
							value={formatDateTime(session.overview.lastMessageAt)}
						/>
					</div>
					<div className="grid gap-3 md:grid-cols-4">
						<StatCard
							label="Total tokens"
							value={compactNumber(session.stats.totalTokens)}
						/>
						<StatCard
							label="LLM calls"
							value={formatNumber(session.stats.llmCalls)}
						/>
						<StatCard
							label="Duration"
							value={formatDuration(session.stats.durationMs)}
						/>
						<StatCard
							label="Tools / turns"
							value={`${formatNumber(session.stats.toolCalls)} / ${formatNumber(
								session.stats.turns,
							)}`}
						/>
					</div>
				</CardContent>
			</Card>

			<Card className="rounded-lg">
				<CardHeader className="flex flex-row items-start justify-between gap-4">
					<div>
						<CardTitle className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
							Current context
						</CardTitle>
						<p className="mt-2 text-sm text-muted-foreground">
							Context trend across recent LLM calls
						</p>
					</div>
					<div className="font-mono text-lg font-semibold">
						{compactNumber(session.currentContext.usedTokens)}
						<span className="text-sm text-muted-foreground">
							{" "}
							/ {compactNumber(session.currentContext.windowTokens)}
						</span>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="h-2 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500"
							style={{
								width: `${Math.max(2, session.currentContext.usedPercent)}%`,
							}}
						/>
					</div>
					<div className="flex flex-wrap gap-2">
						<Pill
							label="Used"
							value={`${formatNumber(session.currentContext.usedPercent)}%`}
						/>
						<Pill
							label="Peak context"
							value={compactNumber(session.currentContext.peakTokens)}
						/>
						<Pill
							label="Compactions"
							value={formatNumber(session.currentContext.compactions)}
						/>
					</div>
					<Sparkline
						points={session.currentContext.trend.map((p) => p.percent)}
					/>
				</CardContent>
			</Card>

			<section className="grid gap-4 lg:grid-cols-2">
				<Card className="rounded-lg">
					<CardHeader>
						<CardTitle className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
							Token usage
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<UsageBar
							label="Input"
							value={session.tokenUsage.input}
							max={maxTokenUsage}
						/>
						<UsageBar
							label="Output"
							value={session.tokenUsage.output}
							max={maxTokenUsage}
						/>
						<UsageBar
							label="Input / output"
							value={session.tokenUsage.ratio}
							max={maxTokenUsage}
							display={`${session.tokenUsage.ratio.toFixed(1)}:1`}
						/>
					</CardContent>
				</Card>

				<Card className="rounded-lg">
					<CardHeader>
						<CardTitle className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
							Cache
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<UsageBar
							label="Hit rate"
							value={session.cache.hitRate}
							max={100}
							display={`${formatNumber(session.cache.hitRate)}%`}
						/>
						<UsageBar
							label="Reads"
							value={session.cache.reads}
							max={session.cache.reads + session.cache.writes || 1}
						/>
						<UsageBar
							label="Writes"
							value={session.cache.writes}
							max={session.cache.reads + session.cache.writes || 1}
						/>
					</CardContent>
				</Card>
			</section>

			<SessionActivityFeed items={session.activity} />

			<SessionObjectLinkGateClient
				sessionId={session.id}
				sessionTitle={session.title}
			/>

			<details className="rounded-lg border bg-card" open>
				<summary className="cursor-pointer border-b px-4 py-3 text-sm font-semibold">
					Trace details
				</summary>
				<div className="grid gap-0 lg:grid-cols-[20rem_minmax(0,1fr)]">
					<aside className="border-b p-4 lg:border-b-0 lg:border-r">
						<div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
							<Route className="size-4" />
							Requests
						</div>
						<div className="space-y-2">
							{session.traceRequests.map((request, index) => (
								<div key={request.id} className="rounded-md border p-3">
									<div className="flex items-center justify-between gap-2">
										<span className="font-mono text-sm text-emerald-600 dark:text-emerald-300">
											#{index + 1}
										</span>
										<Badge variant="outline">{request.model}</Badge>
									</div>
									<p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
										{request.preview}
									</p>
									<p className="mt-2 font-mono text-xs text-muted-foreground">
										{formatDuration(request.durationMs)} ·{" "}
										{formatNumber(request.inputTokens)} in ·{" "}
										{formatNumber(request.outputTokens)} out
									</p>
								</div>
							))}
						</div>
					</aside>
					<section className="min-w-0 p-4">
						<div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
							<Hash className="size-4" />
							Input
						</div>
						<div className="space-y-4">
							{session.traceRequests.map((request) => (
								<article key={request.id} className="rounded-lg border p-4">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant="outline">{request.model}</Badge>
										<span className="font-mono text-xs text-muted-foreground">
											{formatDuration(request.durationMs)} ·{" "}
											{compactNumber(request.inputTokens)} tok
										</span>
									</div>
									<div className="mt-3 space-y-2">
										{request.inputMessages.length === 0 ? (
											<p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
												Input message blocks не записаны в trace.
											</p>
										) : (
											request.inputMessages.map((message, index) => (
												<div
													key={`${request.id}-${message.role}-${index}`}
													className="rounded-md border bg-muted/40 p-3"
												>
													<div className="mb-2 font-mono text-xs text-muted-foreground">
														{message.role} msg[{index}]
													</div>
													<pre className="whitespace-pre-wrap break-words text-xs leading-5">
														{message.content}
													</pre>
												</div>
											))
										)}
									</div>
								</article>
							))}
						</div>
					</section>
				</div>
			</details>

			<Card className="rounded-lg">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
						<Terminal className="size-4" />
						Tool call sequence
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{session.toolSequence.items.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Tool calls не записаны в trace.
						</p>
					) : (
						<>
							<div className="flex min-h-8 flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-3">
								{session.toolSequence.items.map((item, index) => (
									<span
										key={item.id}
										className={`h-5 w-1.5 rounded-full ${
											legendByTool.get(item.toolName)?.colorClassName ??
											"bg-muted-foreground"
										}`}
										title={`${index + 1}. ${item.toolName}`}
									/>
								))}
							</div>
							<div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
								{session.toolSequence.legend.map((item) => (
									<span
										key={item.toolName}
										className="flex items-center gap-1.5"
									>
										<span
											className={`size-2 rounded-full ${item.colorClassName}`}
										/>
										{item.toolName} {formatNumber(item.count)} (
										{formatNumber(item.percent)}%)
									</span>
								))}
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</main>
	);
}

function OverviewItem({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
				{label}
			</div>
			<div className="mt-2 text-sm font-medium">{value}</div>
		</div>
	);
}

function StatCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border bg-muted/30 p-4">
			<div className="text-2xl font-semibold">{value}</div>
			<div className="mt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
				{label}
			</div>
		</div>
	);
}

function Pill({ label, value }: { label: string; value: string }) {
	return (
		<span className="rounded-full border bg-muted/40 px-3 py-1 text-xs">
			<span className="text-muted-foreground">{label}</span>{" "}
			<span className="font-mono font-medium">{value}</span>
		</span>
	);
}

function Sparkline({ points }: { points: number[] }) {
	const safePoints = points.length > 0 ? points : [0];
	const coordinates = safePoints.map((point, index) => {
		const x =
			safePoints.length === 1 ? 0 : (index / (safePoints.length - 1)) * 100;
		const y = 38 - (Math.max(0, Math.min(point, 100)) / 100) * 34;
		return `${x.toFixed(2)},${y.toFixed(2)}`;
	});

	return (
		<svg
			viewBox="0 0 100 42"
			role="img"
			aria-label="Context trend across recent LLM calls"
			className="h-24 w-full overflow-visible"
			preserveAspectRatio="none"
		>
			<polyline
				points={coordinates.join(" ")}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				vectorEffect="non-scaling-stroke"
				className="text-emerald-500"
			/>
		</svg>
	);
}

function UsageBar({
	label,
	value,
	max,
	display,
}: {
	label: string;
	value: number;
	max: number;
	display?: string;
}) {
	return (
		<div className="grid grid-cols-[7rem_minmax(0,1fr)_5rem] items-center gap-3 text-sm">
			<div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
				{label}
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-emerald-500"
					style={{
						width: `${Math.max(2, Math.min(100, (value / max) * 100))}%`,
					}}
				/>
			</div>
			<div className="text-right font-mono text-xs">
				{display ?? compactNumber(value)}
			</div>
		</div>
	);
}

function formatDateTime(value: string) {
	return new Intl.DateTimeFormat("ru-RU", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));
}

function formatDuration(ms: number) {
	const seconds = Math.floor(ms / 1000);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = seconds % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${rest}s`;
	}
	return `${rest}s`;
}

function formatNumber(value: number) {
	return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
		value,
	);
}

function compactNumber(value: number) {
	return new Intl.NumberFormat("ru-RU", {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}
