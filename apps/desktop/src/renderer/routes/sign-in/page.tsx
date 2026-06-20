import { type AuthProvider, COMPANY } from "@rox/shared/constants";
import { DEV_EMAIL, DEV_NAME, DEV_PASSWORD } from "@rox/shared/dev-credentials";
import { Button } from "@rox/ui/button";
import { Spinner } from "@rox/ui/spinner";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FaGithub, FaTelegram } from "react-icons/fa";
import { env } from "renderer/env.renderer";
import { track } from "renderer/lib/analytics";
import { setAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { RoxLogo } from "./components/RoxLogo";
import { useSessionRecovery } from "./hooks/useSessionRecovery";

export const Route = createFileRoute("/sign-in/")({
	component: SignInPage,
});

function SignInPage() {
	const signInMutation = electronTrpc.auth.signIn.useMutation();
	const persistToken = electronTrpc.auth.persistToken.useMutation();
	const navigate = useNavigate();
	const [isLoadingDev, setIsLoadingDev] = useState(false);
	const [devError, setDevError] = useState<string | null>(null);
	const { isPending, session } = useSessionRecovery();

	// Dev bypass: skip sign-in entirely
	if (env.SKIP_ENV_VALIDATION) {
		return <Navigate to="/workspace" replace />;
	}

	// Genuine session-restore state: animated so it's clear work is happening.
	if (isPending) {
		return (
			<div className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-background">
				<RoxLogo className="h-20 w-auto" gradient />
				<div className="flex flex-col items-center gap-3">
					<Spinner className="size-5 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						Восстанавливаем сессию…
					</p>
				</div>
			</div>
		);
	}

	// If already signed in, redirect to workspace
	if (session?.user) {
		return <Navigate to="/workspace" replace />;
	}

	const signIn = (provider: AuthProvider) => {
		track("auth_started", { provider });
		signInMutation.mutate({ provider });
	};

	const signInAsDev = async () => {
		setIsLoadingDev(true);
		setDevError(null);

		const postAuth = async (path: string, body: Record<string, unknown>) => {
			const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "omit",
				body: JSON.stringify(body),
			});
			const data = (await response.json().catch(() => ({}))) as {
				token?: string;
				code?: string;
				message?: string;
			};
			return { ok: response.ok, status: response.status, data };
		};

		try {
			let result = await postAuth("/api/auth/sign-in/email", {
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
			});
			if (!result.ok && result.data.code === "INVALID_EMAIL_OR_PASSWORD") {
				const signUp = await postAuth("/api/auth/sign-up/email", {
					email: DEV_EMAIL,
					password: DEV_PASSWORD,
					name: DEV_NAME,
				});
				if (!signUp.ok) {
					throw new Error(
						signUp.data.message ??
							`Не удалось зарегистрироваться (${signUp.status})`,
					);
				}
				result = await postAuth("/api/auth/sign-in/email", {
					email: DEV_EMAIL,
					password: DEV_PASSWORD,
				});
			}
			if (!result.ok) {
				throw new Error(
					result.data.message ?? `Не удалось войти (${result.status})`,
				);
			}
			const token = result.data.token;
			if (!token) throw new Error("Вход не вернул токен");
			const expiresAt = new Date(
				Date.now() + 1000 * 60 * 60 * 24 * 30,
			).toISOString();
			await persistToken.mutateAsync({ token, expiresAt });
			setAuthToken(token);
			await navigate({ to: "/workspace", replace: true });
		} catch (error) {
			setDevError(
				error instanceof Error
					? error.message
					: "Не удалось войти в dev-режиме",
			);
			setIsLoadingDev(false);
		}
	};

	return (
		<div className="flex flex-col h-full w-full bg-background">
			<div className="h-12 w-full drag shrink-0" />

			<div className="flex flex-1 items-center justify-center">
				<div className="flex flex-col items-center w-full max-w-md px-8">
					<div className="mb-8">
						<RoxLogo className="h-24 w-auto" />
					</div>

					<div className="text-center mb-8">
						<h1 className="text-xl font-semibold text-foreground mb-2">
							Войдите в Rox
						</h1>
						<p className="text-sm text-muted-foreground">
							Продолжите, чтобы начать работу
						</p>
					</div>

					<div className="flex flex-col gap-3 w-full max-w-xs">
						{env.NODE_ENV === "development" && (
							<Button
								variant="outline"
								size="lg"
								onClick={signInAsDev}
								className="w-full gap-3"
								disabled={isLoadingDev}
							>
								{isLoadingDev
									? "Входим..."
									: "Войти как локальный администратор (dev)"}
							</Button>
						)}
						{devError && (
							<p className="text-xs text-destructive text-center select-text cursor-text">
								{devError}
							</p>
						)}
						<Button
							variant="outline"
							size="lg"
							onClick={() => signIn("github")}
							className="w-full gap-3"
							disabled={signInMutation.isPending}
						>
							<FaGithub className="size-5" />
							Продолжить с GitHub
						</Button>
						<Button
							variant="outline"
							size="lg"
							onClick={() => signIn("yandex")}
							className="w-full gap-3"
							disabled={signInMutation.isPending}
						>
							<span
								aria-hidden
								className="flex size-5 items-center justify-center rounded-full bg-[#FC3F1D] text-[11px] font-bold text-white"
							>
								Я
							</span>
							Войти через Яндекс
						</Button>
						<Button
							variant="outline"
							size="lg"
							onClick={() => signIn("telegram")}
							className="w-full gap-3"
							disabled={signInMutation.isPending}
						>
							<FaTelegram className="size-5 text-[#229ED9]" />
							Войти через Telegram
						</Button>
					</div>

					<p className="mt-8 text-xs text-muted-foreground/70 text-center max-w-xs">
						Входя в аккаунт, вы соглашаетесь с нашими{" "}
						<a
							href={COMPANY.TERMS_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-muted-foreground transition-colors"
						>
							Условиями использования
						</a>{" "}
						и{" "}
						<a
							href={COMPANY.PRIVACY_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-muted-foreground transition-colors"
						>
							Политикой конфиденциальности
						</a>
					</p>
				</div>
			</div>
		</div>
	);
}
