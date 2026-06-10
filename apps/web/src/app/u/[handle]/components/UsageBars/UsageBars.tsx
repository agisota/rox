import { Card, CardContent, CardHeader, CardTitle } from "@rox/ui/card";

type UsageDay = {
	date: string;
	totalTokens: number;
};

type UsageBarsProps = {
	days: UsageDay[];
};

const dayFormatter = new Intl.DateTimeFormat("ru", {
	day: "2-digit",
	month: "short",
});

const numberFormatter = new Intl.NumberFormat("ru");

export function UsageBars({ days }: UsageBarsProps) {
	const maxTokens = Math.max(1, ...days.map((day) => day.totalTokens));

	return (
		<Card>
			<CardHeader>
				<CardTitle>Ежедневное использование</CardTitle>
			</CardHeader>
			<CardContent>
				{days.length > 0 ? (
					<div className="grid min-h-52 grid-cols-[repeat(14,minmax(0,1fr))] items-end gap-2">
						{days.map((day) => {
							const height = Math.max(8, (day.totalTokens / maxTokens) * 100);

							return (
								<div key={day.date} className="flex min-w-0 flex-col gap-2">
									<div className="flex h-36 items-end rounded-md bg-muted/40 p-1">
										<div
											role="img"
											className="w-full rounded-sm bg-primary"
											style={{ height: `${height}%` }}
											aria-label={`${dayFormatter.format(new Date(day.date))}: ${numberFormatter.format(day.totalTokens)} токенов`}
										/>
									</div>
									<div className="truncate text-center text-[10px] text-muted-foreground">
										{dayFormatter.format(new Date(day.date))}
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
						Пока нет опубликованной статистики по дням.
					</div>
				)}
			</CardContent>
		</Card>
	);
}
