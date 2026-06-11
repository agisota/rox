import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { RadioGroup, RadioGroupItem } from "@rox/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { useEffect, useId, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { DeployCommandBlock } from "./components/DeployCommandBlock";

type HostKindOption = "local" | "remote" | "sandbox";
type ProviderId = "daytona" | "modal" | "e2b";

interface ProviderOption {
	id: ProviderId;
	label: string;
	available: boolean;
}

interface AddHostModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const KIND_OPTIONS: Array<{
	id: HostKindOption;
	title: string;
	description: string;
}> = [
	{
		id: "local",
		title: "Это устройство",
		description: "Запустить службу хоста на этом компьютере.",
	},
	{
		id: "remote",
		title: "Постоянный удалённый хост",
		description: "Управляемое удалённое окружение, которое остаётся в сети.",
	},
	{
		id: "sandbox",
		title: "Временная песочница (~1 ч)",
		description:
			"Краткоживущая песочница, которая останавливается автоматически.",
	},
];

function deployCommand(kind: HostKindOption, provider: ProviderId): string {
	if (kind === "local") return "rox deploy --self";
	return `rox deploy --kind ${kind} --provider ${provider}`;
}

export function AddHostModal({ open, onOpenChange }: AddHostModalProps) {
	const nameId = useId();
	const [kind, setKind] = useState<HostKindOption>("local");
	const [provider, setProvider] = useState<ProviderId>("daytona");
	const [name, setName] = useState("");
	const [providers, setProviders] = useState<ProviderOption[]>([]);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		apiTrpcClient.v2Host.listProviders
			.query()
			.then((rows) => {
				if (!cancelled) setProviders(rows);
			})
			.catch(() => {
				if (!cancelled) setProviders([]);
			});
		return () => {
			cancelled = true;
		};
	}, [open]);

	const isManaged = kind === "remote" || kind === "sandbox";
	const selectedProvider = providers.find((p) => p.id === provider);
	const canProvision =
		isManaged && name.trim().length > 0 && selectedProvider?.available === true;

	const handleProvision = async () => {
		if (kind === "local" || !canProvision) return;
		setSubmitting(true);
		try {
			const host = await apiTrpcClient.v2Host.provision.mutate({
				name: name.trim(),
				kind,
				provider,
			});
			toast.success(`Подготавливаем ${host.name}…`);
			onOpenChange(false);
			setName("");
			setKind("local");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Не удалось подготовить хост",
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Добавить хост</DialogTitle>
					<DialogDescription>
						Подключите это устройство или подготовьте управляемый удалённый хост
						либо песочницу.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-5">
					<RadioGroup
						value={kind}
						onValueChange={(value) => setKind(value as HostKindOption)}
						className="space-y-2"
					>
						{KIND_OPTIONS.map((option) => (
							<label
								key={option.id}
								htmlFor={`${nameId}-${option.id}`}
								className={cn(
									"flex cursor-pointer items-start gap-3 rounded-md border p-3",
									kind === option.id && "border-foreground",
								)}
							>
								<RadioGroupItem
									id={`${nameId}-${option.id}`}
									value={option.id}
									className="mt-0.5"
								/>
								<span className="space-y-0.5">
									<span className="block text-sm font-medium">
										{option.title}
									</span>
									<span className="block text-xs text-muted-foreground">
										{option.description}
									</span>
								</span>
							</label>
						))}
					</RadioGroup>

					{isManaged && (
						<div className="space-y-4">
							<div className="space-y-1.5">
								<Label htmlFor={nameId}>Название хоста</Label>
								<Input
									id={nameId}
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="my-remote-host"
								/>
							</div>

							<div className="space-y-1.5">
								<Label>Провайдер</Label>
								<Select
									value={provider}
									onValueChange={(value) => setProvider(value as ProviderId)}
								>
									<SelectTrigger>
										<SelectValue placeholder="Выберите провайдера" />
									</SelectTrigger>
									<SelectContent>
										{providers.map((p) => (
											<SelectItem
												key={p.id}
												value={p.id}
												disabled={!p.available}
											>
												{p.label}
												{p.available ? "" : " (не настроен)"}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
					)}

					<div className="space-y-1.5">
						<p className="text-xs text-muted-foreground">
							{kind === "local"
								? "Или запустите службу хоста самостоятельно:"
								: "Или разверните хост самостоятельно с компьютера под вашим управлением:"}
						</p>
						<DeployCommandBlock command={deployCommand(kind, provider)} />
					</div>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Отмена
					</Button>
					{isManaged && (
						<Button
							onClick={() => void handleProvision()}
							disabled={!canProvision || submitting}
						>
							{submitting ? "Подготовка…" : "Подготовить"}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
