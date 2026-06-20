"use client";

import { Badge } from "@rox/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import { Skeleton } from "@rox/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@rox/ui/table";
import { format } from "date-fns";

import { TopUpDialog } from "./components/TopUpDialog";

interface LedgerEntry {
	id: string;
	deltaRox: string;
	kind: string;
	createdAt: Date;
}

interface BalanceCardProps {
	userId: string;
	balanceRox: string | undefined;
	ledger: LedgerEntry[] | undefined;
	isLoading?: boolean;
}

export function BalanceCard({
	userId,
	balanceRox,
	ledger,
	isLoading,
}: BalanceCardProps) {
	const rows = ledger ?? [];

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Balance</CardTitle>
						<CardDescription>Prepaid Rox balance + ledger</CardDescription>
					</div>
					<TopUpDialog userId={userId} />
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div>
					{isLoading && balanceRox === undefined ? (
						<Skeleton className="h-9 w-32" />
					) : (
						<p className="text-3xl font-bold tabular-nums">
							{balanceRox ?? "0"} <span className="text-base">Rox</span>
						</p>
					)}
				</div>

				{rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">No ledger entries.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Kind</TableHead>
								<TableHead className="text-right">Delta</TableHead>
								<TableHead>When</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((entry) => (
								<TableRow key={entry.id}>
									<TableCell>
										<Badge variant="secondary">{entry.kind}</Badge>
									</TableCell>
									<TableCell className="text-right font-mono tabular-nums">
										{entry.deltaRox}
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{format(new Date(entry.createdAt), "PP p")}
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
