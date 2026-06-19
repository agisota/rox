"use client";

import { authClient } from "@rox/auth/client";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { env } from "@/env";

export default function SignUpPage() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLoadingEmail, setIsLoadingEmail] = useState(false);
	const [isLoadingGithub, setIsLoadingGithub] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signUpWithEmail = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsLoadingEmail(true);
		setError(null);

		try {
			const res = await authClient.signUp.email({ name, email, password });
			if (res.error) throw new Error(res.error.message);
			window.location.href = env.NEXT_PUBLIC_WEB_URL;
		} catch (err) {
			console.error("Email sign up failed:", err);
			setError(
				err instanceof Error
					? err.message
					: "Не удалось зарегистрироваться. Попробуйте еще раз.",
			);
			setIsLoadingEmail(false);
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

	const isLoading = isLoadingEmail || isLoadingGithub;

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
				<form onSubmit={signUpWithEmail} className="grid gap-3">
					<div className="grid gap-2">
						<Label htmlFor="name">Имя</Label>
						<Input
							id="name"
							type="text"
							autoComplete="name"
							placeholder="Иван Иванов"
							value={name}
							onChange={(e) => setName(e.target.value)}
							disabled={isLoading}
							required
						/>
					</div>
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
							autoComplete="new-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							disabled={isLoading}
							required
						/>
					</div>
					<Button type="submit" disabled={isLoading} className="w-full">
						{isLoadingEmail ? "Создание аккаунта..." : "Зарегистрироваться"}
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
				<Button
					variant="outline"
					disabled={isLoading}
					onClick={signUpWithGithub}
					className="w-full"
				>
					<FaGithub className="mr-2 size-4" />
					{isLoadingGithub ? "Загрузка..." : "Зарегистрироваться через GitHub"}
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
