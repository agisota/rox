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
import { Coins } from "lucide-react";
import { api } from "@/trpc/server";
import { TopUpForm } from "./components/TopUpForm";

const LEDGER_KIND_LABELS: Record<string, string> = {
	topup: "Top-up",
	request_charge: "Request",
	adjustment: "Adjustment",
	seed: "Welcome grant",
};

function formatRox(value: number): string {
	return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function BalancePage() {
	const trpc = await api();
	const [balance, history] = await Promise.all([
		trpc.economy.balance.query(),
		trpc.economy.history.query({ limit: 10 }),
	]);

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-2xl font-semibold">Balance</h1>
				<p className="text-muted-foreground">
					Your prepaid Rox balance. Top up with USDT — usage is metered per
					request.
				</p>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardDescription className="flex items-center gap-2">
							<Coins className="size-4" />
							Current balance
						</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{formatRox(balance.balanceRox)} Rox
						</CardTitle>
						<p className="text-sm text-muted-foreground">
							≈ ${balance.balanceUsdt.toFixed(2)} USDT ·{" "}
							{balance.tier === "subscriber" ? "Subscriber" : "Free"} tier
						</p>
					</CardHeader>
					<CardContent>
						<TopUpForm />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Recent activity</CardTitle>
						<CardDescription>Latest balance changes.</CardDescription>
					</CardHeader>
					<CardContent>
						{history.items.length === 0 ? (
							<p className="py-6 text-center text-sm text-muted-foreground">
								No activity yet.
							</p>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Type</TableHead>
										<TableHead>Date</TableHead>
										<TableHead className="text-right">Δ Rox</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{history.items.map((entry) => (
										<TableRow key={entry.id}>
											<TableCell>
												{LEDGER_KIND_LABELS[entry.kind] ?? entry.kind}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{entry.createdAt.toLocaleDateString()}
											</TableCell>
											<TableCell
												className={`text-right tabular-nums ${
													entry.deltaRox < 0
														? "text-destructive"
														: "text-green-600 dark:text-green-500"
												}`}
											>
												{entry.deltaRox > 0 ? "+" : ""}
												{formatRox(entry.deltaRox)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
