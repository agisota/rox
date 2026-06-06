"use client";

import { authClient } from "@superset/auth/client";
import { COMPANY } from "@superset/shared/constants";
import {
	DEV_EMAIL,
	DEV_NAME,
	DEV_PASSWORD,
} from "@superset/shared/dev-credentials";
import { Button } from "@superset/ui/button";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { env } from "@/env";

export default function SignInPage() {
	const searchParams = useSearchParams();
	const redirect = searchParams.get("redirect");
	const callbackURL = redirect
		? `${env.NEXT_PUBLIC_WEB_URL}${redirect}`
		: env.NEXT_PUBLIC_WEB_URL;

	const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
	const [isLoadingGithub, setIsLoadingGithub] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signInWithGoogle = async () => {
		setIsLoadingGoogle(true);
		setError(null);

		try {
			await authClient.signIn.social({
				provider: "google",
				callbackURL,
			});
		} catch (err) {
			console.error("Sign in failed:", err);
			setError("Не удалось войти. Попробуйте еще раз.");
			setIsLoadingGoogle(false);
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

	const [isLoadingDev, setIsLoadingDev] = useState(false);

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
				err instanceof Error ? err.message : "Не удалось войти как dev-user",
			);
			setIsLoadingDev(false);
		}
	};

	const isLoading = isLoadingGoogle || isLoadingGithub || isLoadingDev;

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					С возвращением
				</h1>
				<p className="text-muted-foreground text-sm">
					Войдите, чтобы продолжить работу в {COMPANY.NAME}
				</p>
			</div>
			<div className="grid gap-4">
				{error && (
					<p className="text-destructive text-center text-sm">{error}</p>
				)}
				{process.env.NODE_ENV === "development" && (
					<Button
						variant="outline"
						disabled={isLoading}
						onClick={signInAsDev}
						className="w-full"
					>
						{isLoadingDev ? "Входим..." : "Войти как локальный админ (dev)"}
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
					onClick={signInWithGoogle}
					className="w-full"
				>
					<FcGoogle className="mr-2 size-4" />
					{isLoadingGoogle ? "Загрузка..." : "Войти через Google"}
				</Button>
				<p className="text-muted-foreground px-8 text-center text-sm">
					Продолжая, вы принимаете{" "}
					<a
						href={`${env.NEXT_PUBLIC_MARKETING_URL}/terms`}
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-primary underline underline-offset-4"
					>
						условия сервиса
					</a>{" "}
					и{" "}
					<a
						href={`${env.NEXT_PUBLIC_MARKETING_URL}/privacy`}
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-primary underline underline-offset-4"
					>
						политику конфиденциальности
					</a>
					.
				</p>
				<p className="text-center text-sm">
					Нет аккаунта?{" "}
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
