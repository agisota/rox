"use client";

import { authClient } from "@rox/auth/client";
import { DEV_EMAIL, DEV_NAME, DEV_PASSWORD } from "@rox/shared/dev-credentials";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { env } from "@/env";
import { TelegramLoginButton } from "../../components/TelegramLoginButton";

export default function SignInPage() {
	const searchParams = useSearchParams();
	const redirect = searchParams.get("redirect");
	const callbackURL = redirect
		? `${env.NEXT_PUBLIC_WEB_URL}${redirect}`
		: env.NEXT_PUBLIC_WEB_URL;

	const isDev = process.env.NODE_ENV === "development";

	const [email, setEmail] = useState(isDev ? DEV_EMAIL : "");
	const [password, setPassword] = useState(isDev ? DEV_PASSWORD : "");
	const [isLoadingEmail, setIsLoadingEmail] = useState(false);
	const [isLoadingGithub, setIsLoadingGithub] = useState(false);
	const [isLoadingYandex, setIsLoadingYandex] = useState(false);
	const [isLoadingDev, setIsLoadingDev] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signInWithEmail = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsLoadingEmail(true);
		setError(null);

		try {
			const res = await authClient.signIn.email({ email, password });
			if (res.error) throw new Error(res.error.message);
			window.location.href = callbackURL;
		} catch (err) {
			console.error("Email sign in failed:", err);
			setError(
				err instanceof Error
					? err.message
					: "Не удалось войти. Проверьте email и пароль.",
			);
			setIsLoadingEmail(false);
		}
	};

	const signInWithGithub = async () => {
		setIsLoadingGithub(true);
		setError(null);

		try {
			await authClient.signIn.social({
				provider: "github",
				callbackURL,
			});
		} catch (err) {
			console.error("Sign in failed:", err);
			setError("Не удалось войти. Попробуйте еще раз.");
			setIsLoadingGithub(false);
		}
	};

	const signInWithYandex = async () => {
		setIsLoadingYandex(true);
		setError(null);

		try {
			await authClient.signIn.oauth2({
				providerId: "yandex",
				callbackURL,
			});
		} catch (err) {
			console.error("Yandex sign in failed:", err);
			setError("Не удалось войти через Яндекс. Попробуйте еще раз.");
			setIsLoadingYandex(false);
		}
	};

	const signInAsDev = async () => {
		setIsLoadingDev(true);
		setError(null);

		try {
			let res = await authClient.signIn.email({
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
			});
			if (res.error) {
				const signUpRes = await authClient.signUp.email({
					email: DEV_EMAIL,
					password: DEV_PASSWORD,
					name: DEV_NAME,
				});
				if (signUpRes.error) throw new Error(signUpRes.error.message);
				res = await authClient.signIn.email({
					email: DEV_EMAIL,
					password: DEV_PASSWORD,
				});
			}
			if (res.error) throw new Error(res.error.message);
			window.location.href = callbackURL;
		} catch (err) {
			console.error("Dev sign in failed:", err);
			setError(
				err instanceof Error ? err.message : "Не удалось войти как разработчик",
			);
			setIsLoadingDev(false);
		}
	};

	const isLoading =
		isLoadingEmail || isLoadingGithub || isLoadingYandex || isLoadingDev;

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					С возвращением
				</h1>
				<p className="text-muted-foreground text-sm">
					Войдите, чтобы продолжить работу с Rox
				</p>
			</div>
			<div className="grid gap-4">
				{error && (
					<p className="text-destructive text-center text-sm">{error}</p>
				)}
				<form onSubmit={signInWithEmail} className="grid gap-3">
					<div className="grid gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							autoComplete="email"
							placeholder="you@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							disabled={isLoading}
							required
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="password">Пароль</Label>
						<Input
							id="password"
							type="password"
							autoComplete="current-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							disabled={isLoading}
							required
						/>
					</div>
					<Button type="submit" disabled={isLoading} className="w-full">
						{isLoadingEmail ? "Выполняется вход..." : "Войти"}
					</Button>
				</form>
				<div className="relative">
					<div className="absolute inset-0 flex items-center">
						<span className="w-full border-t" />
					</div>
					<div className="relative flex justify-center text-xs uppercase">
						<span className="bg-background text-muted-foreground px-2">
							или
						</span>
					</div>
				</div>
				{isDev && (
					<Button
						variant="outline"
						disabled={isLoading}
						onClick={signInAsDev}
						className="w-full"
					>
						{isLoadingDev
							? "Выполняется вход..."
							: "Войти как локальный администратор (dev)"}
					</Button>
				)}
				<Button
					variant="outline"
					disabled={isLoading}
					onClick={signInWithGithub}
					className="w-full"
				>
					<FaGithub className="mr-2 size-4" />
					{isLoadingGithub ? "Загрузка..." : "Войти через GitHub"}
				</Button>
				<Button
					variant="outline"
					disabled={isLoading}
					onClick={signInWithYandex}
					className="w-full"
				>
					<span
						aria-hidden
						className="mr-2 flex size-4 items-center justify-center rounded-full bg-[#FC3F1D] text-[10px] font-bold text-white"
					>
						Я
					</span>
					{isLoadingYandex ? "Загрузка..." : "Войти через Яндекс"}
				</Button>
				<TelegramLoginButton callbackURL={callbackURL} />
				<p className="text-muted-foreground px-8 text-center text-sm">
					Нажимая «Продолжить», вы соглашаетесь с нашими{" "}
					<a
						href={`${env.NEXT_PUBLIC_MARKETING_URL}/terms`}
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-primary underline underline-offset-4"
					>
						Условиями обслуживания
					</a>{" "}
					и{" "}
					<a
						href={`${env.NEXT_PUBLIC_MARKETING_URL}/privacy`}
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-primary underline underline-offset-4"
					>
						Политикой конфиденциальности
					</a>
					.
				</p>
				<p className="text-center text-sm">
					Еще нет аккаунта?{" "}
					<Link
						href="/sign-up"
						className="hover:text-primary underline underline-offset-4"
					>
						Зарегистрироваться
					</Link>
				</p>
			</div>
		</div>
	);
}
