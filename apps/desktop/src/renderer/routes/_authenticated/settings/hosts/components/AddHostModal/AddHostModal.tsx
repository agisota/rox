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
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { DeployCommandBlock } from "./components/DeployCommandBlock";

type HostKindOption = "local" | "remote" | "sandbox";
type ProviderId = "daytona" | "modal" | "e2b" | "self";
// Providers the server `provision` mutation actually accepts. `self` is
// surfaced in the picker but provisioned out-of-band, so it is excluded here.
type ManagedProviderId = Exclude<ProviderId, "self">;

function isManagedProvider(id: ProviderId): id is ManagedProviderId {
	return id !== "self";
}

interface ProviderOption {
	id: ProviderId;
	label: string;
	available: boolean;
}

type ProviderCredentials = Partial<Record<ManagedProviderId, string>>;

const PROVIDER_CREDENTIALS_STORAGE_KEY = "rox.hostProviderCredentials.v1";
const MANAGED_PROVIDER_IDS = [
	"daytona",
	"modal",
	"e2b",
] as const satisfies readonly ManagedProviderId[];

// RU display copy for providers. The server's `listProviders` returns English
// brand names; we override them here so the picker stays Russian. `self`
// (one-click host on our own Docker box, RoxSelfProvisioner) is surfaced
// locally because it is not yet returned by the server provider list — it
// stays unavailable until the backend (published host-service image) enables it.
const PROVIDER_COPY: Record<
	ProviderId,
	{ label: string; description: string }
> = {
	daytona: {
		label: "Daytona",
		description: "Управляемые удалённые рабочие пространства.",
	},
	modal: { label: "Modal", description: "Управляемые песочницы Modal." },
	e2b: { label: "E2B", description: "Управляемые песочницы E2B." },
	self: {
		label: "Сервер Rox (удалённый)",
		description: "Развернуть хост у нас, в один клик.",
	},
};

// Locally-surfaced providers not (yet) returned by the server provider list.
const LOCAL_ONLY_PROVIDERS: readonly ProviderId[] = ["self"];

const PROVIDER_CREDENTIAL_COPY: Record<
	ManagedProviderId,
	{ label: string; placeholder: string }
> = {
	daytona: { label: "Daytona", placeholder: "dtn_..." },
	modal: { label: "Modal", placeholder: "token..." },
	e2b: { label: "E2B", placeholder: "e2b_..." },
};

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

function isProviderCredentials(value: unknown): value is ProviderCredentials {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return MANAGED_PROVIDER_IDS.every((id) => {
		const credential = record[id];
		return credential === undefined || typeof credential === "string";
	});
}

function readProviderCredentials(): ProviderCredentials {
	if (typeof window === "undefined") return {};
	const raw = window.localStorage.getItem(PROVIDER_CREDENTIALS_STORAGE_KEY);
	if (!raw) return {};

	try {
		const parsed: unknown = JSON.parse(raw);
		return isProviderCredentials(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function writeProviderCredentials(credentials: ProviderCredentials): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(
		PROVIDER_CREDENTIALS_STORAGE_KEY,
		JSON.stringify(credentials),
	);
}

function hasProviderCredential(
	credentials: ProviderCredentials,
	providerId: ProviderId,
): boolean {
	if (!isManagedProvider(providerId)) return false;
	return Boolean(credentials[providerId]?.trim());
}

export function AddHostModal({ open, onOpenChange }: AddHostModalProps) {
	const nameId = useId();
	const [kind, setKind] = useState<HostKindOption>("local");
	const [provider, setProvider] = useState<ProviderId>("daytona");
	const [name, setName] = useState("");
	const [providers, setProviders] = useState<ProviderOption[]>([]);
	const [providerCredentials, setProviderCredentials] =
		useState<ProviderCredentials>({});
	const [providerCredentialInputs, setProviderCredentialInputs] = useState<
		Record<ManagedProviderId, string>
	>({
		daytona: "",
		modal: "",
		e2b: "",
	});
	const [submitting, setSubmitting] = useState(false);
	const [showAdvanced, setShowAdvanced] = useState(false);

	// Local host ("this device") is managed by the host-service coordinator and
	// auto-started by LocalHostServiceProvider — so the device is a host by
	// click, no terminal required. We surface its live status + a one-click
	// connect/retry here, and keep the manual `rox deploy` command secondary.
	const localHost = useLocalHostService();
	const startLocal = electronTrpc.hostServiceCoordinator.start.useMutation();
	const localConnected =
		localHost.hostServiceStatus === "running" || !!localHost.activeHostUrl;
	const localStarting =
		localHost.hostServiceStatus === "starting" || startLocal.isPending;

	const handleConnectLocal = () => {
		if (!localHost.activeOrganizationId) {
			toast.error(
				"Нет активной организации. Войдите снова или выберите организацию.",
			);
			return;
		}
		startLocal.mutate(
			{ organizationId: localHost.activeOrganizationId },
			{
				onSuccess: () => toast.success("Подключаем это устройство…"),
				onError: (err) =>
					toast.error(
						err instanceof Error
							? err.message
							: "Не удалось подключить это устройство",
					),
			},
		);
	};

	useEffect(() => {
		if (!open) return;
		setProviderCredentials(readProviderCredentials());
		setProviderCredentialInputs({ daytona: "", modal: "", e2b: "" });
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

	// Render server providers with RU copy, then append any local-only providers
	// (e.g. rox-self) the server doesn't yet return so they stay visible in the
	// picker — marked unavailable until the backend enables them.
	const displayProviders: ProviderOption[] = [
		...providers.map((p) => ({
			...p,
			label: PROVIDER_COPY[p.id]?.label ?? p.label,
			available:
				p.available || hasProviderCredential(providerCredentials, p.id),
		})),
		...LOCAL_ONLY_PROVIDERS.filter(
			(id) => !providers.some((p) => p.id === id),
		).map((id) => ({
			id,
			label: PROVIDER_COPY[id].label,
			available: false,
		})),
	];

	const isManaged = kind === "remote" || kind === "sandbox";
	const selectedProvider = displayProviders.find((p) => p.id === provider);
	const canProvision =
		isManaged && name.trim().length > 0 && selectedProvider?.available === true;

	const handleProviderCredentialChange = (
		providerId: ManagedProviderId,
		value: string,
	) => {
		setProviderCredentialInputs((current) => ({
			...current,
			[providerId]: value,
		}));
	};

	const handleSaveProviderCredential = (providerId: ManagedProviderId) => {
		const credential = providerCredentialInputs[providerId].trim();
		if (!credential) return;

		const nextCredentials = {
			...providerCredentials,
			[providerId]: credential,
		};
		writeProviderCredentials(nextCredentials);
		setProviderCredentials(nextCredentials);
		setProviderCredentialInputs((current) => ({
			...current,
			[providerId]: "",
		}));
		toast.success(`Ключ ${PROVIDER_COPY[providerId].label} сохранён`);
	};

	const handleClearProviderCredential = (providerId: ManagedProviderId) => {
		const nextCredentials = { ...providerCredentials };
		delete nextCredentials[providerId];
		writeProviderCredentials(nextCredentials);
		setProviderCredentials(nextCredentials);
		toast.success(`Ключ ${PROVIDER_COPY[providerId].label} удалён`);
	};

	const handleProvision = async () => {
		if (kind === "local" || !canProvision) return;
		// `self` is never provisioned server-side (always unavailable in the
		// picker), so `canProvision` rules it out; this guard also narrows the
		// type to the providers the mutation accepts.
		if (!isManagedProvider(provider)) return;
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

					{kind === "local" && (
						<div className="flex items-center gap-3 rounded-md border p-3">
							<span
								className={cn(
									"size-2 shrink-0 rounded-full",
									localConnected
										? "bg-green-500"
										: localStarting
											? "bg-yellow-500"
											: "bg-muted-foreground",
								)}
							/>
							<div className="flex-1 space-y-0.5">
								<p className="text-sm font-medium">
									{localConnected
										? "Это устройство подключено и готово"
										: localStarting
											? "Подключаем это устройство…"
											: "Это устройство не подключено"}
								</p>
								<p className="text-xs text-muted-foreground">
									{localConnected
										? "Можно создавать рабочие пространства прямо здесь."
										: "Запустите службу хоста на этом компьютере одним кликом."}
								</p>
							</div>
							{!localConnected && (
								<Button
									size="sm"
									onClick={handleConnectLocal}
									disabled={localStarting}
								>
									{localStarting ? "Подключение…" : "Подключить"}
								</Button>
							)}
						</div>
					)}

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
										{displayProviders.map((p) => (
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

							<div className="space-y-3 rounded-md border p-3">
								<div>
									<p className="text-sm font-medium">Ключи провайдеров</p>
									<p className="text-xs text-muted-foreground">
										Сохраните API-ключ или токен, чтобы провайдер стал доступен
										в списке выше.
									</p>
								</div>
								<div className="space-y-2">
									{MANAGED_PROVIDER_IDS.map((providerId) => {
										const copy = PROVIDER_CREDENTIAL_COPY[providerId];
										const hasCredential = hasProviderCredential(
											providerCredentials,
											providerId,
										);
										const inputValue = providerCredentialInputs[providerId];
										return (
											<div
												key={providerId}
												className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto]"
											>
												<Label
													htmlFor={`${nameId}-${providerId}-key`}
													className="self-center text-xs"
												>
													{copy.label}
												</Label>
												<Input
													id={`${nameId}-${providerId}-key`}
													type="password"
													value={inputValue}
													onChange={(event) =>
														handleProviderCredentialChange(
															providerId,
															event.target.value,
														)
													}
													placeholder={
														hasCredential ? "Ключ сохранён" : copy.placeholder
													}
													className="h-8 font-mono"
												/>
												<div className="flex gap-1">
													<Button
														type="button"
														size="sm"
														variant="outline"
														onClick={() =>
															handleSaveProviderCredential(providerId)
														}
														disabled={!inputValue.trim()}
													>
														Сохранить
													</Button>
													{hasCredential && (
														<Button
															type="button"
															size="sm"
															variant="ghost"
															onClick={() =>
																handleClearProviderCredential(providerId)
															}
														>
															Удалить
														</Button>
													)}
												</div>
											</div>
										);
									})}
								</div>
							</div>
						</div>
					)}

					<div>
						<button
							type="button"
							onClick={() => setShowAdvanced((v) => !v)}
							className="text-xs text-muted-foreground transition-colors hover:text-foreground"
						>
							{showAdvanced ? "▾" : "▸"} Запустить вручную (headless)
						</button>
						{showAdvanced && (
							<div className="mt-2 space-y-1.5">
								<p className="text-xs text-muted-foreground">
									{kind === "local"
										? "Или запустите службу хоста как фоновый процесс:"
										: "Или разверните хост самостоятельно с компьютера под вашим управлением:"}
								</p>
								<DeployCommandBlock command={deployCommand(kind, provider)} />
							</div>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Отмена
					</Button>
					{kind === "local" &&
						(localConnected ? (
							<Button onClick={() => onOpenChange(false)}>Готово</Button>
						) : (
							<Button onClick={handleConnectLocal} disabled={localStarting}>
								{localStarting ? "Подключение…" : "Подключить это устройство"}
							</Button>
						))}
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
