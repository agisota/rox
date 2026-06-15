"use client";

import type { RouterOutputs } from "@rox/trpc";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { Save, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { trpcClient } from "@/trpc/client";

export type ManualIntegrationProvider =
	| "telegram"
	| "obsidian"
	| "fibery"
	| "lark";

type ManualConnection =
	RouterOutputs["integration"]["telegram"]["getConnection"];
type ManualConfigKey =
	| "botUsername"
	| "defaultChatId"
	| "vaultName"
	| "account"
	| "tenantKey";
type ManualConnectionConfig = Partial<Record<ManualConfigKey, string>>;

interface ManualIntegrationControlsProps {
	organizationId: string;
	provider: ManualIntegrationProvider;
	connection: ManualConnection;
}

interface ManualField {
	key: ManualConfigKey;
	label: string;
	placeholder: string;
}

const PROVIDER_FORM: Record<
	ManualIntegrationProvider,
	{
		secretLabel: string;
		secretPlaceholder: string;
		fields: ManualField[];
	}
> = {
	telegram: {
		secretLabel: "Bot token",
		secretPlaceholder: "1234567890:AA...",
		fields: [
			{
				key: "botUsername",
				label: "Bot username",
				placeholder: "@rox_agent_bot",
			},
			{
				key: "defaultChatId",
				label: "Default chat ID",
				placeholder: "-1001234567890",
			},
		],
	},
	obsidian: {
		secretLabel: "Local REST API key",
		secretPlaceholder: "obsidian-local-rest-api-key",
		fields: [
			{
				key: "vaultName",
				label: "Vault name",
				placeholder: "Product brain",
			},
		],
	},
	fibery: {
		secretLabel: "Fibery API token",
		secretPlaceholder: "fibery-api-token",
		fields: [
			{
				key: "account",
				label: "Account subdomain",
				placeholder: "acme",
			},
		],
	},
	lark: {
		secretLabel: "Lark app secret or tenant token",
		secretPlaceholder: "lark-secret",
		fields: [
			{
				key: "tenantKey",
				label: "Tenant key",
				placeholder: "tenant_key",
			},
		],
	},
};

function getConfigValue(
	config: NonNullable<ManualConnection>["config"] | null | undefined,
	key: ManualConfigKey,
) {
	if (!config || !(key in config)) return "";
	const value = (config as ManualConnectionConfig)[key];
	return typeof value === "string" ? value : "";
}

async function connectProvider(
	provider: ManualIntegrationProvider,
	input: {
		organizationId: string;
		accessToken?: string;
		externalOrgName?: string;
		config: Record<string, string>;
	},
) {
	switch (provider) {
		case "telegram":
			return trpcClient.integration.telegram.connect.mutate(input);
		case "obsidian":
			return trpcClient.integration.obsidian.connect.mutate(input);
		case "fibery":
			return trpcClient.integration.fibery.connect.mutate(input);
		case "lark":
			return trpcClient.integration.lark.connect.mutate(input);
	}
}

async function disconnectProvider(
	provider: ManualIntegrationProvider,
	organizationId: string,
) {
	switch (provider) {
		case "telegram":
			return trpcClient.integration.telegram.disconnect.mutate({
				organizationId,
			});
		case "obsidian":
			return trpcClient.integration.obsidian.disconnect.mutate({
				organizationId,
			});
		case "fibery":
			return trpcClient.integration.fibery.disconnect.mutate({
				organizationId,
			});
		case "lark":
			return trpcClient.integration.lark.disconnect.mutate({
				organizationId,
			});
	}
}

export function ManualIntegrationControls({
	organizationId,
	provider,
	connection,
}: ManualIntegrationControlsProps) {
	const router = useRouter();
	const isConnected = !!connection;
	const form = PROVIDER_FORM[provider];
	const [secret, setSecret] = useState("");
	const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			form.fields.map((field) => [
				field.key,
				getConfigValue(connection?.config, field.key),
			]),
		),
	);
	const [isSaving, setIsSaving] = useState(false);
	const [isDisconnecting, setIsDisconnecting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSaving(true);

		try {
			const trimmedSecret = secret.trim();
			const config = Object.fromEntries(
				Object.entries(fieldValues).map(([key, value]) => [key, value.trim()]),
			);
			await connectProvider(provider, {
				organizationId,
				accessToken: trimmedSecret || undefined,
				externalOrgName:
					Object.values(config).find((value) => value.length > 0) ?? undefined,
				config,
			});
			setSecret("");
			toast.success("Интеграция сохранена");
			router.refresh();
		} catch {
			toast.error("Не удалось сохранить интеграцию");
		} finally {
			setIsSaving(false);
		}
	}

	async function handleDisconnect() {
		setIsDisconnecting(true);

		try {
			await disconnectProvider(provider, organizationId);
			toast.success("Интеграция отключена");
			router.refresh();
		} catch {
			toast.error("Не удалось отключить интеграцию");
		} finally {
			setIsDisconnecting(false);
		}
	}

	return (
		<div className="space-y-5">
			<form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2 sm:col-span-2">
					<Label htmlFor={`${provider}-secret`}>{form.secretLabel}</Label>
					<Input
						id={`${provider}-secret`}
						type="password"
						value={secret}
						onChange={(event) => setSecret(event.target.value)}
						placeholder={
							isConnected
								? "Оставьте пустым, чтобы не менять сохранённый секрет"
								: form.secretPlaceholder
						}
						autoComplete="off"
						required={!isConnected}
					/>
				</div>

				{form.fields.map((field) => (
					<div key={field.key} className="space-y-2">
						<Label htmlFor={`${provider}-${field.key}`}>{field.label}</Label>
						<Input
							id={`${provider}-${field.key}`}
							value={fieldValues[field.key] ?? ""}
							onChange={(event) =>
								setFieldValues((current) => ({
									...current,
									[field.key]: event.target.value,
								}))
							}
							placeholder={field.placeholder}
						/>
					</div>
				))}

				<div className="flex flex-wrap gap-2 sm:col-span-2">
					<Button type="submit" disabled={isSaving}>
						<Save className="mr-2 size-4" />
						{isSaving ? "Сохраняем..." : "Сохранить подключение"}
					</Button>

					{isConnected && (
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									type="button"
									variant="outline"
									disabled={isDisconnecting}
								>
									<Unplug className="mr-2 size-4" />
									{isDisconnecting ? "Отключаем..." : "Отключить"}
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Отключить интеграцию?</AlertDialogTitle>
									<AlertDialogDescription>
										Это удалит сохранённый секрет и связь с внешним сервисом.
										Подключение можно будет создать заново.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Отмена</AlertDialogCancel>
									<AlertDialogAction onClick={handleDisconnect}>
										Отключить
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					)}
				</div>
			</form>

			<p className="text-xs text-muted-foreground">
				Секрет хранится только на стороне API и не отображается после
				сохранения. В карточках статуса показываются только публичные поля
				конфигурации.
			</p>
		</div>
	);
}
