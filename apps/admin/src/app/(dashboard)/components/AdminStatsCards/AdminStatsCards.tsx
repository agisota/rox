"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { MetricCard } from "../MetricCard";

export function AdminStatsCards() {
	const trpc = useTRPC();
	const { data, isLoading, error } = useQuery(
		trpc.admin.getStats.queryOptions(),
	);

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<MetricCard
				title="Total users"
				value={data?.totalUsers}
				isLoading={isLoading}
				error={error}
			/>
			<MetricCard
				title="Total organizations"
				value={data?.totalOrganizations}
				isLoading={isLoading}
				error={error}
			/>
			<MetricCard
				title="New signups"
				description="Last 7 days"
				value={data?.recentSignups}
				isLoading={isLoading}
				error={error}
			/>
			<MetricCard
				title="Active sessions"
				value={data?.activeSessions}
				isLoading={isLoading}
				error={error}
			/>
		</div>
	);
}
