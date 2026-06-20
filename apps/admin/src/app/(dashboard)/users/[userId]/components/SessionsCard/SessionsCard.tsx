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
import { format } from "date-fns";

interface SessionRow {
	id: string;
	expiresAt: Date;
	createdAt: Date;
	ipAddress: string | null;
	userAgent: string | null;
}

interface SessionsCardProps {
	sessions: SessionRow[] | undefined;
}

export function SessionsCard({ sessions }: SessionsCardProps) {
	const rows = sessions ?? [];
	const now = Date.now();

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sessions</CardTitle>
				<CardDescription>
					{rows.length} session{rows.length !== 1 ? "s" : ""}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">No sessions.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Status</TableHead>
								<TableHead>IP</TableHead>
								<TableHead>User agent</TableHead>
								<TableHead>Expires</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((s) => {
								const active = new Date(s.expiresAt).getTime() > now;
								return (
									<TableRow key={s.id}>
										<TableCell>
											{active ? (
												<Badge variant="secondary">Active</Badge>
											) : (
												<Badge variant="outline">Expired</Badge>
											)}
										</TableCell>
										<TableCell className="font-mono text-xs">
											{s.ipAddress ?? "—"}
										</TableCell>
										<TableCell className="text-muted-foreground max-w-xs truncate text-xs">
											{s.userAgent ?? "—"}
										</TableCell>
										<TableCell className="text-muted-foreground text-xs">
											{format(new Date(s.expiresAt), "PP p")}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
