"use client";

import { authClient } from "@rox/auth/client";
import { Button } from "@rox/ui/button";
import Link from "next/link";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { env } from "@/env";

export default function SignUpPage() {
	const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
	const [isLoadingGithub, setIsLoadingGithub] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signUpWithGoogle = async () => {
		setIsLoadingGoogle(true);
		setError(null);

		try {
			await authClient.signIn.social({
				provider: "google",
				callbackURL: env.NEXT_PUBLIC_WEB_URL,
			});
		} catch (err) {
			console.error("Sign up failed:", err);
			setError("Не удалось зарегистрироваться. Попробуйте еще раз.");
			setIsLoadingGoogle(false);
		}
	};

	const signUpWithGithub = async () => {
		setIsLoadingGithub(true);
		setError(null);

		try {
			await authClient.signIn.social({
				provider: "github",
				callbackURL: env.NEXT_PUBLIC_WEB_URL,
			});
		} catch (err) {
			console.error("Sign up failed:", err);
			setError("Не удалось зарегистрироваться. Попробуйте еще раз.");
			setIsLoadingGithub(false);
		}
	};

	const isLoading = isLoadingGoogle || isLoadingGithub;

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Создайте аккаунт
				</h1>
				<p className="text-muted-foreground text-sm">
					Зарегистрируйтесь, чтобы начать работу с Rox
				</p>
			</div>
			<div className="grid gap-4">
				{error && (
					<p className="text-destructive text-center text-sm">{error}</p>
				)}
				<Button
					variant="outline"
					disabled={isLoading}
					onClick={signUpWithGithub}
					className="w-full"
				>
					<FaGithub className="mr-2 size-4" />
					{isLoadingGithub ? "Загрузка..." : "Зарегистрироваться через GitHub"}
				</Button>
				<Button
					variant="outline"
					disabled={isLoading}
					onClick={signUpWithGoogle}
					className="w-full"
				>
					<FcGoogle className="mr-2 size-4" />
					{isLoadingGoogle ? "Загрузка..." : "Зарегистрироваться через Google"}
				</Button>
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
					Уже есть аккаунт?{" "}
					<Link
						href="/sign-in"
						className="hover:text-primary underline underline-offset-4"
					>
						Войти
					</Link>
				</p>
			</div>
		</div>
	);
}
