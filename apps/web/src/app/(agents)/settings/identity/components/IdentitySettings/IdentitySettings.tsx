"use client";

import { authClient } from "@rox/auth/client";
import { validateHandle } from "@rox/shared/username";
import { Alert, AlertDescription, AlertTitle } from "@rox/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@rox/ui/avatar";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Lock } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TelegramLoginButton } from "@/app/(auth)/components/TelegramLoginButton";
import { useTRPC } from "@/trpc/react";
import { providerMeta } from "./providerMeta";

/**
 * Local validation copy mirrors the server's `HANDLE_ERROR_MESSAGES`. The server
 * stays authoritative; this only gives instant feedback before submit.
 */
const HANDLE_ERROR_MESSAGES = {
	empty: "Введите имя пользователя.",
	too_short: "Имя пользователя должно быть не короче 4 символов.",
	too_long: "Имя пользователя должно быть не длиннее 16 символов.",
	invalid_chars: "Разрешены только строчные латинские буквы, цифры и «_».",
	reserved: "Это имя зарезервировано. Выберите другое.",
} as const;

export function IdentitySettings() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const identityQuery = useQuery(trpc.identity.getMine.queryOptions());

	const [handleInput, setHandleInput] = useState("");

	const claimMutation = useMutation(
		trpc.identity.claimHandle.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.identity.getMine.queryKey(),
				});
				setHandleInput("");
				toast.success("Имя пользователя сохранено");
			},
			onError: (error) => {
				toast.error(error.message || "Не удалось сохранить имя пользователя");
			},
		}),
	);

	const localError = useMemo(() => {
		if (handleInput.trim().length === 0) return null;
		const result = validateHandle(handleInput);
		if (result.ok || !result.error) return null;
		return HANDLE_ERROR_MESSAGES[result.error];
	}, [handleInput]);

	if (identityQuery.isLoading || !identityQuery.data) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-40 w-full rounded-xl" />
				<Skeleton className="h-48 w-full rounded-xl" />
			</div>
		);
	}

	const {
		handle,
		connectedAccounts,
		missingProviders,
		canClaimHandle: gateOpen,
	} = identityQuery.data;

	const connectGithub = async () => {
		try {
			await authClient.signIn.social({
				provider: "github",
				callbackURL: window.location.href,
			});
		} catch (error) {
			console.error("[IdentitySettings] github connect failed", error);
			toast.error("Не удалось начать привязку GitHub");
		}
	};

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		const result = validateHandle(handleInput);
		if (!result.ok || !result.normalized) return;
		claimMutation.mutate({ handle: result.normalized });
	};

	return (
		<div className="space-y-8">
			<Card>
				<CardHeader>
					<CardTitle>Привязанные аккаунты</CardTitle>
					<CardDescription>
						Платформы, через которые вы вошли в Rox.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{connectedAccounts.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Пока нет привязанных аккаунтов.
						</p>
					) : (
						<ul className="divide-y rounded-lg border">
							{connectedAccounts.map((account) => {
								const meta = providerMeta(account.providerId);
								const Icon = meta.Icon;
								return (
									<li
										key={`${account.providerId}:${account.providerAccountId}`}
										className="flex items-center gap-4 p-4"
									>
										<Avatar className="size-10">
											{account.providerAvatarUrl ? (
												<AvatarImage
													src={account.providerAvatarUrl}
													alt={meta.label}
												/>
											) : null}
											<AvatarFallback>
												<Icon className="size-5" />
											</AvatarFallback>
										</Avatar>
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-2">
												<span className="font-medium">{meta.label}</span>
												{account.isRegistrationProvider ? (
													<Badge variant="secondary">Основной</Badge>
												) : null}
											</div>
											{account.displayUsername ? (
												<p className="truncate text-muted-foreground text-sm">
													@{account.displayUsername}
												</p>
											) : null}
											<p className="truncate text-muted-foreground text-xs">
												ID: {account.providerAccountId}
											</p>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Имя пользователя</CardTitle>
					<CardDescription>
						Публичный адрес профиля: rox.one/@&lt;имя&gt;. 4–16 символов,
						строчные латинские буквы, цифры и «_».
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{handle ? (
						<Alert>
							<CheckCircle2 className="size-4" />
							<AlertTitle>Имя пользователя выбрано</AlertTitle>
							<AlertDescription>
								<Link
									href={`/@${handle}`}
									className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
								>
									rox.one/@{handle}
									<ExternalLink className="size-3.5" />
								</Link>
							</AlertDescription>
						</Alert>
					) : null}

					{gateOpen ? (
						<form className="space-y-3" onSubmit={handleSubmit}>
							<div className="space-y-2">
								<Label htmlFor="handle">
									{handle
										? "Изменить имя пользователя"
										: "Выбрать имя пользователя"}
								</Label>
								<div className="flex items-center gap-2">
									<span className="text-muted-foreground">@</span>
									<Input
										id="handle"
										value={handleInput}
										onChange={(event) =>
											setHandleInput(event.target.value.toLowerCase())
										}
										placeholder="username"
										autoCapitalize="none"
										autoCorrect="off"
										spellCheck={false}
										maxLength={16}
									/>
								</div>
								{localError ? (
									<p className="text-destructive text-sm">{localError}</p>
								) : null}
							</div>
							<Button
								type="submit"
								disabled={
									claimMutation.isPending ||
									handleInput.trim().length === 0 ||
									localError !== null
								}
							>
								{claimMutation.isPending ? "Сохранение…" : "Сохранить"}
							</Button>
						</form>
					) : (
						<Alert>
							<Lock className="size-4" />
							<AlertTitle>
								Привяжите аккаунты, чтобы выбрать имя пользователя
							</AlertTitle>
							<AlertDescription className="space-y-3">
								<p>Осталось привязать:</p>
								<ul className="space-y-3">
									{missingProviders.map((providerId) => {
										const meta = providerMeta(providerId);
										const Icon = meta.Icon;
										return (
											<li
												key={providerId}
												className="flex items-center justify-between gap-3"
											>
												<span className="flex items-center gap-2 font-medium text-foreground">
													<Icon className="size-4" />
													{meta.label}
												</span>
												{providerId === "github" ? (
													<Button
														type="button"
														size="sm"
														variant="outline"
														onClick={connectGithub}
													>
														Привязать
													</Button>
												) : providerId === "telegram" ? (
													<TelegramLoginButton
														callbackURL={
															typeof window === "undefined"
																? "/settings/identity"
																: window.location.href
														}
													/>
												) : null}
											</li>
										);
									})}
								</ul>
							</AlertDescription>
						</Alert>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
