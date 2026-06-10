import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@rox/ui/table";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Лига миллиарда | Rox",
	description:
		"Закрытое сообщество Rox для пользователей, которые тратят 1 миллиард+ токенов каждый день.",
};

type LeagueTier = "Миллиард+" | "Титан" | "Профи" | "Разгон";

interface LeaderboardEntry {
	rank: number;
	handle: string;
	displayName: string;
	dailyTokens: string;
	primaryModel: string;
	tier: LeagueTier;
	streakDays: number;
}

const leaderboard: LeaderboardEntry[] = [
	{
		rank: 1,
		handle: "@agentmax",
		displayName: "Максим Оркестратор",
		dailyTokens: "1,48 млрд",
		primaryModel: "gpt-5.5",
		tier: "Миллиард+",
		streakDays: 19,
	},
	{
		rank: 2,
		handle: "@vibequeen",
		displayName: "Алина VibeOps",
		dailyTokens: "1,22 млрд",
		primaryModel: "claude-sonnet",
		tier: "Миллиард+",
		streakDays: 14,
	},
	{
		rank: 3,
		handle: "@forklift",
		displayName: "Илья Forkney",
		dailyTokens: "970 млн",
		primaryModel: "gpt-5.3-codex",
		tier: "Титан",
		streakDays: 11,
	},
	{
		rank: 4,
		handle: "@shipstorm",
		displayName: "Катя Shipstorm",
		dailyTokens: "740 млн",
		primaryModel: "gemini-3-pro",
		tier: "Профи",
		streakDays: 8,
	},
	{
		rank: 5,
		handle: "@nightbuild",
		displayName: "Денис Night Build",
		dailyTokens: "510 млн",
		primaryModel: "grok-code-fast",
		tier: "Разгон",
		streakDays: 6,
	},
];

const leagueBenefits = [
	"частные группы для тех, кто реально строит с агентами каждый день",
	"закрытые семинары по агентным пайплайнам, промптам и параллельным ворктри",
	"нетворкинг элиты вайб-кодинга: обмен связками, receipt-ами и рабочими стратегиями",
];

const tierClassName: Record<LeagueTier, string> = {
	"Миллиард+": "border-primary/20 bg-primary text-primary-foreground",
	Титан:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	Профи: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	Разгон:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

export default function LeaguePage() {
	return (
		<main className="min-h-screen bg-background text-foreground">
			<section className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
				<div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
					<div className="flex flex-col gap-6">
						<Badge variant="outline" className="w-fit rounded-md px-3 py-1">
							Лига миллиарда Rox
						</Badge>
						<div className="flex flex-col gap-4">
							<h1 className="max-w-4xl text-4xl font-medium leading-tight sm:text-5xl lg:text-6xl">
								1 миллиард+ токенов каждый день. Это новый уровень вайб-кодинга.
							</h1>
							<p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
								Лига миллиарда объединяет пользователей Rox, которые не ждут
								идеального момента, а ежедневно сжигают токены, запускают
								агентов пачками и превращают идеи в работающий код быстрее
								рынка.
							</p>
						</div>
						<div className="flex flex-col gap-3 sm:flex-row">
							<Button size="lg" asChild>
								<Link href="/sign-up">Вступить в лигу</Link>
							</Button>
							<Button size="lg" variant="outline" asChild>
								<Link href="/agents">Разогнать агентов</Link>
							</Button>
						</div>
					</div>

					<div className="grid grid-cols-3 gap-3 rounded-lg border bg-card p-4 text-card-foreground">
						<div className="col-span-3 border-b pb-4">
							<p className="text-sm text-muted-foreground">Цель лиги</p>
							<p className="mt-1 text-3xl font-medium">1 млрд+</p>
							<p className="mt-1 text-sm text-muted-foreground">
								токенов в день на пользователя
							</p>
						</div>
						<div>
							<p className="text-2xl font-medium">24/7</p>
							<p className="text-sm text-muted-foreground">агентный темп</p>
						</div>
						<div>
							<p className="text-2xl font-medium">10+</p>
							<p className="text-sm text-muted-foreground">
								параллельных агентов
							</p>
						</div>
						<div>
							<p className="text-2xl font-medium">∞</p>
							<p className="text-sm text-muted-foreground">амбиций</p>
						</div>
					</div>
				</div>

				<section className="grid gap-4 lg:grid-cols-3" aria-labelledby="about">
					<div className="lg:col-span-1">
						<h2 id="about" className="text-2xl font-medium">
							Что внутри лиги
						</h2>
						<p className="mt-3 text-sm leading-6 text-muted-foreground">
							Это не витрина и не обычный чат. Это закрытое сообщество
							продвинутых пользователей Rox, где ценятся скорость, щедрый
							контекст и ежедневная практика.
						</p>
					</div>
					<div className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
						{leagueBenefits.map((benefit) => (
							<Card key={benefit} className="rounded-lg shadow-none">
								<CardContent className="pt-0">
									<p className="text-sm leading-6">{benefit}</p>
								</CardContent>
							</Card>
						))}
					</div>
				</section>

				<section className="space-y-4" aria-labelledby="leaderboard">
					<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
						<div>
							<h2 id="leaderboard" className="text-2xl font-medium">
								Таблица лидеров
							</h2>
							<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
								Рейтинг считает ежедневный расход токенов. Чем смелее вы кормите
								агентов контекстом, тем выше поднимаетесь и тем ближе попадаете
								к приватным возможностям лиги.
							</p>
						</div>
						<Badge variant="outline" className="w-fit rounded-md">
							Обновляется ежедневно
						</Badge>
					</div>

					<Card className="rounded-lg shadow-none">
						<CardHeader>
							<CardTitle>Топ пользователей Rox</CardTitle>
							<CardDescription>
								Бейдж «Миллиард+» открывается при расходе от 1 млрд токенов в
								день.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-16">Место</TableHead>
										<TableHead>Участник</TableHead>
										<TableHead>Лига</TableHead>
										<TableHead className="text-right">Токены сегодня</TableHead>
										<TableHead className="hidden text-right md:table-cell">
											Серия
										</TableHead>
										<TableHead className="hidden lg:table-cell">
											Модель
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{leaderboard.map((entry) => (
										<TableRow key={entry.handle}>
											<TableCell className="font-medium">
												#{entry.rank}
											</TableCell>
											<TableCell>
												<div className="flex flex-col">
													<span className="font-medium">
														{entry.displayName}
													</span>
													<span className="text-xs text-muted-foreground">
														{entry.handle}
													</span>
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className={tierClassName[entry.tier]}
												>
													{entry.tier}
												</Badge>
											</TableCell>
											<TableCell className="text-right font-medium">
												{entry.dailyTokens}
											</TableCell>
											<TableCell className="hidden text-right md:table-cell">
												{entry.streakDays} дн.
											</TableCell>
											<TableCell className="hidden lg:table-cell">
												{entry.primaryModel}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</section>

				<section className="rounded-lg border bg-muted/30 px-5 py-6 sm:px-8 sm:py-8">
					<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
						<div>
							<h2 className="text-2xl font-medium">
								Ваш следующий рывок начинается с токенов.
							</h2>
							<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
								Откройте Rox, запустите несколько агентов, дайте им больше
								контекста и доведите ежедневный расход до миллиарда. Лига видит
								тех, кто работает на максимальной скорости.
							</p>
						</div>
						<Button size="lg" asChild>
							<Link href="/sign-up">Вступить в лигу</Link>
						</Button>
					</div>
				</section>
			</section>
		</main>
	);
}
