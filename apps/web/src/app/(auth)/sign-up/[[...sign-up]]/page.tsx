"use client";

import { authClient } from "@rox/auth/client";
import { Button } from "@rox/ui/button";
import Link from "next/link";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { env } from "@/env";
import { TelegramLoginButton } from "../../components/TelegramLoginButton";

export default function SignUpPage() {
	// ROX-522 Phase 3: registration is social-only. The public name/email/password
	// form was removed; users sign up via Telegram, Yandex, or GitHub.
	const [isLoadingGithub, setIsLoadingGithub] = useState(false);
	const [isLoadingYandex, setIsLoadingYandex] = useState(false);
	const [error, setError] = useState<string | null>(null);

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

	const signUpWithYandex = async () => {
		setIsLoadingYandex(true);
		setError(null);

		try {
			await authClient.signIn.oauth2({
				providerId: "yandex",
				callbackURL: env.NEXT_PUBLIC_WEB_URL,
			});
		} catch (err) {
			console.error("Yandex sign up failed:", err);
			setError(
				"Не удалось зарегистрироваться через Яндекс. Попробуйте еще раз.",
			);
			setIsLoadingYandex(false);
		}
	};

	const isLoading = isLoadingGithub || isLoadingYandex;

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
				{/* TODO(ROX-522): GitHub stays as a full social login for now.
				    Demoting GitHub to a link-only ("connect account") option is a
				    separate follow-up and is intentionally not implemented here. */}
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
					onClick={signUpWithYandex}
					className="w-full"
				>
					<span
						aria-hidden
						className="mr-2 flex size-4 items-center justify-center rounded-full bg-[#FC3F1D] text-[10px] font-bold text-white"
					>
						Я
					</span>
					{isLoadingYandex ? "Загрузка..." : "Зарегистрироваться через Яндекс"}
				</Button>
				<TelegramLoginButton callbackURL={env.NEXT_PUBLIC_WEB_URL} />
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
