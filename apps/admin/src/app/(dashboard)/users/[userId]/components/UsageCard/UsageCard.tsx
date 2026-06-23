"use client";

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

interface UsageRequest {
	id: string;
	modelId: string | null;
	tokensIn: number | null;
	tokensOut: number | null;
	usdCost: string | null;
	roxCost: string | null;
	createdAt: Date;
}

interface UsageCardProps {
	requests: UsageRequest[] | undefined;
}

export function UsageCard({ requests }: UsageCardProps) {
	const rows = requests ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Usage</CardTitle>
				<CardDescription>
					{rows.length} recent request{rows.length !== 1 ? "s" : ""}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">No usage recorded.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Model</TableHead>
								<TableHead className="text-right">Tokens (in/out)</TableHead>
								<TableHead className="text-right">USD</TableHead>
								<TableHead className="text-right">Rox</TableHead>
								<TableHead>When</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.slice(0, 50).map((r) => (
								<TableRow key={r.id}>
									<TableCell className="font-mono text-xs">
										{r.modelId ?? "—"}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{r.tokensIn ?? 0} / {r.tokensOut ?? 0}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{r.usdCost ?? "—"}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{r.roxCost ?? "—"}
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{format(new Date(r.createdAt), "PP p")}
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
