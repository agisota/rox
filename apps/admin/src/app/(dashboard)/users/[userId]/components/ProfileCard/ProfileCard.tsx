"use client";

import { getInitials } from "@rox/shared/names";
import { Avatar, AvatarFallback, AvatarImage } from "@rox/ui/avatar";
import { Badge } from "@rox/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@rox/ui/card";
import { Skeleton } from "@rox/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

interface ProfileCardProps {
	user:
		| {
				id: string;
				name: string;
				email: string;
				image: string | null;
				emailVerified: boolean;
				onboardedAt: Date | null;
				createdAt: Date;
		  }
		| undefined;
	isLoading?: boolean;
}

export function ProfileCard({ user, isLoading }: ProfileCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Profile</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoading && !user ? (
					<div className="flex items-center gap-4">
						<Skeleton className="h-12 w-12 rounded-full" />
						<div className="space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-4 w-48" />
						</div>
					</div>
				) : user ? (
					<div className="flex items-center gap-4">
						<Avatar className="h-12 w-12">
							<AvatarImage src={user.image ?? undefined} />
							<AvatarFallback>
								{getInitials(user.name, user.email)}
							</AvatarFallback>
						</Avatar>
						<div className="space-y-1">
							<div className="flex items-center gap-2">
								<span className="text-lg font-semibold">{user.name}</span>
								{user.emailVerified ? (
									<Badge variant="secondary">Verified</Badge>
								) : (
									<Badge variant="outline">Unverified</Badge>
								)}
								{user.onboardedAt ? null : (
									<Badge variant="outline">Onboarding</Badge>
								)}
							</div>
							<p className="text-muted-foreground text-sm">{user.email}</p>
							<p className="text-muted-foreground font-mono text-xs">
								{user.id}
							</p>
							<p className="text-muted-foreground text-xs">
								Joined{" "}
								{formatDistanceToNow(new Date(user.createdAt), {
									addSuffix: true,
								})}
							</p>
						</div>
					</div>
				) : (
					<p className="text-muted-foreground text-sm">User not found.</p>
				)}
			</CardContent>
		</Card>
	);
}
