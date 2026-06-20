"use client";

import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuLoaderCircle, LuPlus } from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

import { parseTopupAmount } from "../../../../utils/parseTopupAmount";

interface TopUpDialogProps {
	userId: string;
}

export function TopUpDialog({ userId }: TopUpDialogProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [amount, setAmount] = useState("");
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);

	const grant = useMutation(
		trpc.economy.admin.grant.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries({
					queryKey: trpc.admin.getUserBalance.queryKey({ userId }),
				});
				toast.success(`Granted. New balance: ${result.balanceAfter} Rox`);
				setOpen(false);
				setAmount("");
				setNote("");
				setError(null);
			},
			onError: (err) => {
				toast.error(`Grant failed: ${err.message}`);
			},
		}),
	);

	const handleSubmit = () => {
		const parsed = parseTopupAmount(amount);
		if (!parsed.ok) {
			setError(parsed.error);
			return;
		}
		setError(null);
		grant.mutate({
			userId,
			rox: parsed.rox,
			note: note.trim() || undefined,
		});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<LuPlus className="mr-1 h-4 w-4" />
					Top up bonus
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Grant bonus Rox</DialogTitle>
					<DialogDescription>
						Credits the user&apos;s balance and appends an adjustment ledger
						entry.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="topup-amount">Amount (Rox)</Label>
						<Input
							id="topup-amount"
							inputMode="decimal"
							placeholder="500"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
						/>
						{error ? <p className="text-destructive text-sm">{error}</p> : null}
					</div>
					<div className="space-y-2">
						<Label htmlFor="topup-note">Note (optional)</Label>
						<Input
							id="topup-note"
							placeholder="welcome bonus"
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => setOpen(false)}
						disabled={grant.isPending}
					>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={grant.isPending}>
						{grant.isPending ? (
							<LuLoaderCircle className="mr-2 h-4 w-4 animate-spin" />
						) : null}
						Grant
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
