"use client";

import { Badge } from "@rox/ui/badge";
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

interface OrgMembership {
	role: string;
	joinedAt: Date;
	organization: {
		id: string;
		name: string;
		slug: string;
	} | null;
}

interface OrgsCardProps {
	organizations: OrgMembership[] | undefined;
}

export function OrgsCard({ organizations }: OrgsCardProps) {
	const rows = organizations ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Organizations</CardTitle>
				<CardDescription>
					{rows.length} membership{rows.length !== 1 ? "s" : ""}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Not a member of any organization.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Organization</TableHead>
								<TableHead>Slug</TableHead>
								<TableHead>Role</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((m) => (
								<TableRow key={m.organization?.id ?? m.joinedAt.toString()}>
									<TableCell className="font-medium">
										{m.organization?.name ?? "—"}
									</TableCell>
									<TableCell className="text-muted-foreground font-mono text-xs">
										{m.organization?.slug ?? "—"}
									</TableCell>
									<TableCell>
										<Badge variant="secondary">{m.role}</Badge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
