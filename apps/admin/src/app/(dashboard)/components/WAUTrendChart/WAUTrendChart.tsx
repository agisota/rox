"use client";

import { DEFAULT_LOCALE } from "@superset/shared/constants";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { Skeleton } from "@superset/ui/skeleton";
import type { ReactNode } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

interface WAUData {
	date: string;
	count: number;
}

interface WAUTrendChartProps {
	data: WAUData[] | null | undefined;
	isLoading?: boolean;
	error?: { message: string } | null;
	headerAction?: ReactNode;
}

const chartConfig = {
	count: {
		label: "WAU",
		color: "var(--chart-1)",
	},
} satisfies ChartConfig;

export function WAUTrendChart({
	data,
	isLoading,
	error,
	headerAction,
}: WAUTrendChartProps) {
	const currentWAU = data?.[data.length - 1]?.count ?? 0;

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Активные пользователи за неделю</CardTitle>
						<CardDescription>
							{currentWAU} пользователей были активны 3+ дня за неделю
						</CardDescription>
					</div>
					{headerAction}
				</div>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-[200px] w-full" />
				) : error ? (
					<div className="flex h-[200px] items-center justify-center">
						<p className="text-destructive text-sm">Не удалось загрузить</p>
					</div>
				) : !data || data.length === 0 ? (
					<div className="flex h-[200px] items-center justify-center rounded-md border border-dashed">
						<p className="text-muted-foreground text-sm">
							Нет данных WAU за этот период
						</p>
					</div>
				) : (
					<ChartContainer config={chartConfig} className="h-[200px] w-full">
						<AreaChart data={data} margin={{ left: 0, right: 0 }}>
							<XAxis
								dataKey="date"
								tickLine={false}
								axisLine={false}
								tickFormatter={(v) =>
									new Date(v).toLocaleDateString(DEFAULT_LOCALE, {
										month: "short",
										day: "numeric",
									})
								}
								tick={{ fontSize: 12 }}
								padding={{ left: 20, right: 20 }}
							/>
							<YAxis hide />
							<ChartTooltip
								content={
									<ChartTooltipContent
										formatter={(value) => `${value} пользователей`}
									/>
								}
							/>
							<Area
								type="monotone"
								dataKey="count"
								stroke="var(--color-count)"
								fill="var(--color-count)"
								fillOpacity={0.2}
							/>
						</AreaChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
