"use client";

import { Button } from "@rox/ui/button";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

import { BalanceCard } from "../BalanceCard";
import { FeatureFlagsCard } from "../FeatureFlagsCard";
import { OrgsCard } from "../OrgsCard";
import { ProfileCard } from "../ProfileCard";
import { SessionsCard } from "../SessionsCard";
import { UsageCard } from "../UsageCard";

interface UserDetailProps {
	userId: string;
}

export function UserDetail({ userId }: UserDetailProps) {
	const trpc = useTRPC();

	const user = useQuery(trpc.admin.getUser.queryOptions({ userId }));
	const balance = useQuery(trpc.admin.getUserBalance.queryOptions({ userId }));
	const usage = useQuery(trpc.admin.getUserUsage.queryOptions({ userId }));
	const sessions = useQuery(
		trpc.admin.getUserSessions.queryOptions({ userId }),
	);
	const flags = useQuery(trpc.admin.getUserFlags.queryOptions({ userId }));

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Button asChild variant="ghost" size="sm">
					<Link href="/users">
						<LuArrowLeft className="mr-1 h-4 w-4" />
						Users
					</Link>
				</Button>
			</div>

			<ProfileCard user={user.data?.user} isLoading={user.isLoading} />
			<OrgsCard organizations={user.data?.organizations} />
			<BalanceCard
				userId={userId}
				balanceRox={balance.data?.balanceRox}
				ledger={balance.data?.ledger}
				isLoading={balance.isLoading}
			/>
			<FeatureFlagsCard
				userId={userId}
				flags={flags.data?.flags}
				isLoading={flags.isLoading}
			/>
			<UsageCard requests={usage.data?.requests} />
			<SessionsCard sessions={sessions.data?.sessions} />
		</div>
	);
}
