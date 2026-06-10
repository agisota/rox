import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { useEffect, useState } from "react";

const CONFIRM_PHRASE = "Я понимаю";

interface ExposeViaRelayConfirmDialogProps {
	open: boolean;
	targetEnabled: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function ExposeViaRelayConfirmDialog({
	open,
	targetEnabled,
	onOpenChange,
	onConfirm,
}: ExposeViaRelayConfirmDialogProps) {
	const [typed, setTyped] = useState("");

	// Reset the typed confirmation whenever the dialog closes so reopening
	// always starts from an empty input.
	useEffect(() => {
		if (!open) setTyped("");
	}, [open]);

	const canConfirm = !targetEnabled || typed === CONFIRM_PHRASE;

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[480px]">
				<AlertDialogHeader>
					<AlertDialogTitle>
						{targetEnabled
							? "Включить доступ через Relay?"
							: "Отключить доступ через Relay?"}
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3 text-sm text-muted-foreground">
							<p>
								Это перезапустит службу хоста и остановит запущенные терминалы.
								Отслеживание файлов и другая работа, зависящая от службы хоста,
								будут прерваны.
							</p>
							{targetEnabled ? (
								<p>
									Удаленные рабочие пространства, которым вы дадите доступ,
									смогут подключаться к этому устройству через Rox Relay.
								</p>
							) : (
								<p>
									Удаленные рабочие пространства больше не смогут подключаться к
									этому устройству через Rox Relay.
								</p>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				{targetEnabled && (
					<div className="space-y-2 pt-2">
						<Label htmlFor="expose-relay-confirm" className="text-xs">
							Введите{" "}
							<span className="font-mono font-medium text-foreground">
								{CONFIRM_PHRASE}
							</span>{" "}
							для продолжения
						</Label>
						<Input
							id="expose-relay-confirm"
							autoFocus
							value={typed}
							onChange={(event) => setTyped(event.target.value)}
							placeholder={CONFIRM_PHRASE}
							autoComplete="off"
							spellCheck={false}
						/>
					</div>
				)}

				<AlertDialogFooter>
					<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
						Отмена
					</Button>
					<Button
						variant="destructive"
						size="sm"
						disabled={!canConfirm}
						onClick={onConfirm}
					>
						{targetEnabled
							? "Включить и перезапустить"
							: "Отключить и перезапустить"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
