"use client";

import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useTRPC } from "@/trpc/react";

const ROX_PER_USDT = 100;

/**
 * Opens a dv.net USDT → Rox top-up invoice. The webhook (be-07) credits the
 * balance once the on-chain payment confirms, so here we only surface the
 * pending invoice and the Rox the user will receive.
 */
export function TopUpForm() {
	const trpc = useTRPC();
	const router = useRouter();
	const [usdt, setUsdt] = useState("5");

	const topUp = useMutation(
		trpc.economy.topUp.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					`Top-up invoice opened for $${result.usdtAmount} → ${result.roxAmount} Rox.`,
				);
				router.refresh();
			},
			onError: (error) => {
				toast.error(error.message || "Failed to open top-up invoice.");
			},
		}),
	);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const amount = Number(usdt);
		if (!Number.isFinite(amount) || amount <= 0) {
			toast.error("Enter a positive USDT amount.");
			return;
		}
		topUp.mutate({ usdtAmount: amount });
	};

	const roxPreview = Number(usdt) > 0 ? Number(usdt) * ROX_PER_USDT : 0;

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:max-w-sm">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="topup-usdt">Top up (USDT)</Label>
				<Input
					id="topup-usdt"
					type="number"
					min="1"
					step="1"
					inputMode="decimal"
					value={usdt}
					onChange={(event) => setUsdt(event.target.value)}
				/>
				<p className="text-sm text-muted-foreground">
					You&apos;ll receive{" "}
					<span className="font-medium text-foreground">
						{roxPreview.toLocaleString()} Rox
					</span>{" "}
					(1 USDT = {ROX_PER_USDT} Rox).
				</p>
			</div>
			<Button type="submit" disabled={topUp.isPending} className="w-fit">
				{topUp.isPending ? "Opening invoice…" : "Pay with USDT (dv.net)"}
			</Button>
		</form>
	);
}
