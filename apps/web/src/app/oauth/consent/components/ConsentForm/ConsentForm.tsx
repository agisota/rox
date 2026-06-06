"use client";

import { authClient } from "@superset/auth/client";
import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useState } from "react";
import {
	LuBuilding2,
	LuCheck,
	LuKey,
	LuMail,
	LuShieldCheck,
	LuUser,
} from "react-icons/lu";

interface Organization {
	id: string;
	name: string;
}

interface ConsentFormProps {
	clientId: string;
	clientName?: string;
	scopes: string[];
	userName: string;
	organizations: Organization[];
	defaultOrganizationId?: string;
}

const SCOPE_DESCRIPTIONS: Record<
	string,
	{ label: string; icon: React.ReactNode }
> = {
	openid: {
		label: "Проверить вашу личность",
		icon: <LuShieldCheck className="size-4" />,
	},
	profile: {
		label: "Получить данные профиля: имя и изображение",
		icon: <LuUser className="size-4" />,
	},
	email: {
		label: "Получить адрес электронной почты",
		icon: <LuMail className="size-4" />,
	},
	offline_access: {
		label: "Оставаться подключенным через обновляемые токены",
		icon: <LuKey className="size-4" />,
	},
};

export function ConsentForm({
	clientId,
	clientName,
	scopes,
	userName,
	organizations,
	defaultOrganizationId,
}: ConsentFormProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedOrgId, setSelectedOrgId] = useState<string>(
		defaultOrganizationId ?? organizations[0]?.id ?? "",
	);

	const showOrgPicker = organizations.length > 1;
	const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

	const handleConsent = async (accept: boolean) => {
		if (accept && !selectedOrgId) {
			setError("Выберите организацию");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			if (accept) {
				const { error: setActiveError } =
					await authClient.organization.setActive({
						organizationId: selectedOrgId,
					});
				if (setActiveError) {
					throw new Error(
						setActiveError.message ?? "Не удалось выбрать организацию",
					);
				}
			}

			const { data, error: consentError } = await authClient.oauth2.consent({
				accept,
				scope: accept ? scopes.join(" ") : undefined,
			});

			if (consentError) {
				throw new Error(
					consentError.message ?? "Не удалось обработать разрешение",
				);
			}

			if (data?.url) {
				window.location.href = data.url;
			}
		} catch (err) {
			console.error("[oauth/consent] Error:", err);
			setError(err instanceof Error ? err.message : "Произошла ошибка");
			setIsLoading(false);
		}
	};

	const displayName = clientName ?? getClientDisplayName(clientId);

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Разрешить доступ для {displayName}
				</h1>
				<p className="text-muted-foreground text-sm">
					<span className="font-medium text-foreground">{displayName}</span>{" "}
					запрашивает доступ к вашему аккаунту {COMPANY.NAME}
				</p>
			</div>

			<div className="bg-muted/50 rounded-lg border p-4">
				<p className="text-muted-foreground mb-3 text-sm">
					Вы вошли как{" "}
					<span className="font-medium text-foreground">{userName}</span>
				</p>

				{showOrgPicker ? (
					<div className="mb-4">
						<label
							htmlFor="org-select"
							className="mb-2 block text-sm font-medium"
						>
							Выберите организацию
						</label>
						<Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
							<SelectTrigger id="org-select" className="w-full">
								<SelectValue placeholder="Выберите организацию" />
							</SelectTrigger>
							<SelectContent>
								{organizations.map((org) => (
									<SelectItem key={org.id} value={org.id}>
										<div className="flex items-center gap-2">
											<LuBuilding2 className="size-4 text-muted-foreground" />
											{org.name}
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground mt-1.5 text-xs">
							Приложение получит доступ к данным выбранной организации.
						</p>
					</div>
				) : selectedOrg ? (
					<p className="text-muted-foreground mb-3 text-sm">
						Организация:{" "}
						<span className="font-medium text-foreground">
							{selectedOrg.name}
						</span>
					</p>
				) : null}

				<p className="mb-2 text-sm font-medium">Приложение сможет:</p>
				<ul className="space-y-2">
					{scopes.map((scope) => {
						const scopeInfo = SCOPE_DESCRIPTIONS[scope];
						return (
							<li key={scope} className="flex items-center gap-2 text-sm">
								<span className="text-muted-foreground">
									{scopeInfo?.icon ?? <LuCheck className="size-4" />}
								</span>
								<span>{scopeInfo?.label ?? scope}</span>
							</li>
						);
					})}
					<li className="flex items-center gap-2 text-sm">
						<span className="text-muted-foreground">
							<LuBuilding2 className="size-4" />
						</span>
						<span>Получить доступ к данным организации</span>
					</li>
				</ul>
			</div>

			{error && <p className="text-destructive text-center text-sm">{error}</p>}

			<div className="flex gap-3">
				<Button
					variant="outline"
					className="flex-1"
					disabled={isLoading}
					onClick={() => handleConsent(false)}
				>
					Отклонить
				</Button>
				<Button
					className="flex-1"
					disabled={isLoading || !selectedOrgId}
					onClick={() => handleConsent(true)}
				>
					{isLoading ? "Разрешаем..." : "Разрешить"}
				</Button>
			</div>

			<p className="text-muted-foreground px-8 text-center text-xs">
				Разрешая доступ, вы позволяете приложению использовать ваши данные по
				его условиям сервиса и политике конфиденциальности.
			</p>
		</div>
	);
}

function getClientDisplayName(clientId: string): string {
	const knownClients: Record<string, string> = {
		"claude-code": "Claude Code",
		"superset-desktop": `${COMPANY.NAME} для компьютера`,
	};
	if (knownClients[clientId]) {
		return knownClients[clientId];
	}
	if (clientId.length > 20) {
		return "Внешнее приложение";
	}
	return clientId;
}
