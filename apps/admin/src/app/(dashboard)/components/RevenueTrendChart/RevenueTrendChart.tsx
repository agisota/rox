"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@rox/ui/chart";
import { Skeleton } from "@rox/ui/skeleton";
import type { ReactNode } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

interface RevenueData {
	date: string;
	revenue: number;
	// Prepaid Rox economy: there is no recurring revenue, so MRR is undefined
	// (the server returns null). Kept for shape-compat; the chart plots revenue.
	mrr: number | null;
}

interface RevenueTrendChartProps {
	data: RevenueData[] | null | undefined;
	isLoading?: boolean;
	error?: { message: string } | null;
	headerAction?: ReactNode;
}

const chartConfig = {
	revenue: {
		label: "Revenue",
		color: "var(--chart-4)",
	},
} satisfies ChartConfig;

function formatCurrency(value: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
}

export function RevenueTrendChart({
	data,
	isLoading,
	error,
	headerAction,
}: RevenueTrendChartProps) {
	const totalRevenue = data?.reduce((sum, d) => sum + d.revenue, 0) ?? 0;

	// Show ~7 ticks evenly distributed
	const tickInterval = data ? Math.max(0, Math.floor(data.length / 7) - 1) : 0;

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Revenue</CardTitle>
						<CardDescription>
							{formatCurrency(totalRevenue)} from confirmed top-ups
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
						<p className="text-destructive text-sm">Failed to load</p>
					</div>
				) : !data || data.length === 0 ? (
					<div className="flex h-[200px] items-center justify-center rounded-md border border-dashed">
						<p className="text-muted-foreground text-sm">
							No revenue data available for this period
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
									new Date(v).toLocaleDateString("en-US", {
										month: "short",
										day: "numeric",
									})
								}
								tick={{ fontSize: 12 }}
								interval={tickInterval}
								padding={{ left: 20, right: 20 }}
							/>
							<YAxis hide />
							<ChartTooltip
								content={
									<ChartTooltipContent
										formatter={(value) => formatCurrency(value as number)}
									/>
								}
							/>
							<Area
								type="monotone"
								dataKey="revenue"
								stroke="var(--color-revenue)"
								fill="var(--color-revenue)"
								fillOpacity={0.2}
							/>
						</AreaChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
