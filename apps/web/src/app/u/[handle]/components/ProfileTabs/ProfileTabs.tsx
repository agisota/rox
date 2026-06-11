import { Badge } from "@rox/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@rox/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rox/ui/tabs";

type ToolBreakdown = {
	tool: string;
	totalTokens: number;
};

type ProfileNote = {
	id: string;
	body: string;
	createdAt: Date;
};

type ProfileAchievement = {
	id: string;
	title: string;
	description: string | null;
	icon: string | null;
	tier: string | null;
	awardedAt: Date;
};

type ProfileTabsProps = {
	tools: ToolBreakdown[];
	notes: ProfileNote[];
	achievements: ProfileAchievement[];
};

const numberFormatter = new Intl.NumberFormat("ru");
const dateFormatter = new Intl.DateTimeFormat("ru", {
	day: "2-digit",
	month: "long",
	year: "numeric",
});

export function ProfileTabs({ tools, notes, achievements }: ProfileTabsProps) {
	const maxToolTokens = Math.max(1, ...tools.map((tool) => tool.totalTokens));

	return (
		<Tabs defaultValue="usage" className="gap-4">
			<TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
				<TabsTrigger value="usage">Использование</TabsTrigger>
				<TabsTrigger value="notes">Заметки</TabsTrigger>
				<TabsTrigger value="achievements">Достижения</TabsTrigger>
			</TabsList>

			<TabsContent value="usage">
				<Card>
					<CardHeader>
						<CardTitle>Разбивка по инструментам</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{tools.length > 0 ? (
							tools.map((tool) => (
								<div key={tool.tool} className="space-y-2">
									<div className="flex items-center justify-between gap-3 text-sm">
										<span className="font-medium">{tool.tool}</span>
										<span className="text-muted-foreground">
											{numberFormatter.format(tool.totalTokens)} токенов
										</span>
									</div>
									<div className="h-2 rounded-full bg-muted">
										<div
											className="h-full rounded-full bg-primary"
											style={{
												width: `${Math.max(3, (tool.totalTokens / maxToolTokens) * 100)}%`,
											}}
										/>
									</div>
								</div>
							))
						) : (
							<p className="text-sm text-muted-foreground">
								Статистика по инструментам пока не опубликована.
							</p>
						)}
					</CardContent>
				</Card>
			</TabsContent>

			<TabsContent value="notes">
				<Card>
					<CardHeader>
						<CardTitle>Опубликованные заметки</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{notes.length > 0 ? (
							notes.map((note) => (
								<article key={note.id} className="rounded-lg border p-4">
									<p className="whitespace-pre-wrap text-sm leading-6">
										{note.body}
									</p>
									<p className="mt-3 text-xs text-muted-foreground">
										{dateFormatter.format(note.createdAt)}
									</p>
								</article>
							))
						) : (
							<p className="text-sm text-muted-foreground">
								Пользователь ещё не публиковал заметки.
							</p>
						)}
					</CardContent>
				</Card>
			</TabsContent>

			<TabsContent value="achievements">
				<Card>
					<CardHeader>
						<CardTitle>Достижения</CardTitle>
					</CardHeader>
					<CardContent>
						{achievements.length > 0 ? (
							<div className="grid gap-3 sm:grid-cols-2">
								{achievements.map((achievement) => (
									<div key={achievement.id} className="rounded-lg border p-4">
										<div className="flex items-start gap-3">
											<div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-lg">
												{achievement.icon || "★"}
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex flex-wrap items-center gap-2">
													<h3 className="font-medium">{achievement.title}</h3>
													{achievement.tier && (
														<Badge variant="outline">{achievement.tier}</Badge>
													)}
												</div>
												{achievement.description && (
													<p className="mt-1 text-sm text-muted-foreground">
														{achievement.description}
													</p>
												)}
												<p className="mt-3 text-xs text-muted-foreground">
													Получено {dateFormatter.format(achievement.awardedAt)}
												</p>
											</div>
										</div>
									</div>
								))}
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								Достижения пока не открыты.
							</p>
						)}
					</CardContent>
				</Card>
			</TabsContent>
		</Tabs>
	);
}

export type { ProfileAchievement, ProfileNote, ToolBreakdown };
