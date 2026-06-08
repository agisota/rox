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
import { api } from "@/trpc/server";
import { buildRecommendations } from "./utils/buildRecommendations";

function formatRox(value: number): string {
	return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function UsagePage() {
	const trpc = await api();
	const usage = await trpc.economy.usage.query({ limit: 50 });

	const totalRox = usage.items.reduce((sum, row) => sum + row.roxCost, 0);
	const totalUsd = usage.items.reduce((sum, row) => sum + row.usdCost, 0);
	const recommendations = buildRecommendations(usage.items);

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-2xl font-semibold">Usage</h1>
				<p className="text-muted-foreground">
					Per-request metering: tokens, USD cost, and Rox charged for every
					model call.
				</p>
			</div>

			<div className="grid gap-6 sm:grid-cols-3">
				<Card>
					<CardHeader>
						<CardDescription>Requests</CardDescription>
						<CardTitle className="text-2xl tabular-nums">
							{usage.items.length}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader>
						<CardDescription>Rox spent</CardDescription>
						<CardTitle className="text-2xl tabular-nums">
							{formatRox(totalRox)}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader>
						<CardDescription>USD cost</CardDescription>
						<CardTitle className="text-2xl tabular-nums">
							${totalUsd.toFixed(4)}
						</CardTitle>
					</CardHeader>
				</Card>
			</div>

			{recommendations.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Recommendations</CardTitle>
						<CardDescription>
							Ways to cut spend based on your recent requests.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						{recommendations.map((rec) => (
							<p key={rec} className="text-sm text-muted-foreground">
								• {rec}
							</p>
						))}
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Request log</CardTitle>
					<CardDescription>Most recent 50 metered requests.</CardDescription>
				</CardHeader>
				<CardContent>
					{usage.items.length === 0 ? (
						<p className="py-6 text-center text-sm text-muted-foreground">
							No requests yet. Usage will appear here once you start chatting.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Model</TableHead>
									<TableHead className="text-right">Tokens in</TableHead>
									<TableHead className="text-right">Tokens out</TableHead>
									<TableHead className="text-right">USD</TableHead>
									<TableHead className="text-right">Rox</TableHead>
									<TableHead>Date</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{usage.items.map((row) => (
									<TableRow key={row.id}>
										<TableCell className="font-medium">{row.modelId}</TableCell>
										<TableCell className="text-right tabular-nums">
											{row.tokensIn.toLocaleString()}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{row.tokensOut.toLocaleString()}
										</TableCell>
										<TableCell className="text-right tabular-nums text-muted-foreground">
											${row.usdCost.toFixed(4)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatRox(row.roxCost)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{row.createdAt.toLocaleString()}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
