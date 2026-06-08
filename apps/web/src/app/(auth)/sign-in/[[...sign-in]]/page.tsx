"use client";

import { authClient } from "@rox/auth/client";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
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

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLoadingEmail, setIsLoadingEmail] = useState(false);
	const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
	const [isLoadingGithub, setIsLoadingGithub] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isLoading = isLoadingGoogle || isLoadingGithub || isLoadingEmail;

	const signInWithEmail = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoadingEmail(true);
		setError(null);
		try {
			const res = await authClient.signIn.email({ email, password });
			if (res.error) throw new Error(res.error.message ?? "Sign in failed");
			window.location.href = callbackURL;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to sign in.");
			setIsLoadingEmail(false);
		}
	};

	const signInWithGoogle = async () => {
		setIsLoadingGoogle(true);
		setError(null);
		try {
			await authClient.signIn.social({ provider: "google", callbackURL });
		} catch (err) {
			console.error("Sign in failed:", err);
			setError("Failed to sign in. Please try again.");
			setIsLoadingGoogle(false);
		}
	};

	const signInWithGithub = async () => {
		setIsLoadingGithub(true);
		setError(null);
		try {
			await authClient.signIn.social({ provider: "github", callbackURL });
		} catch (err) {
			console.error("Sign in failed:", err);
			setError("Failed to sign in. Please try again.");
			setIsLoadingGithub(false);
		}
	};

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
				<p className="text-muted-foreground text-sm">
					Sign in to continue to Rox
				</p>
			</div>
			<div className="grid gap-4">
				{error && (
					<p className="text-destructive text-center text-sm">{error}</p>
				)}

				<form onSubmit={signInWithEmail} className="grid gap-3">
					<div className="grid gap-1.5">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							autoComplete="email"
							placeholder="you@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							disabled={isLoading}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							autoComplete="current-password"
							placeholder="••••••••"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							disabled={isLoading}
						/>
					</div>
					<Button type="submit" disabled={isLoading} className="w-full">
						{isLoadingEmail ? "Signing in..." : "Sign in"}
					</Button>
				</form>

				<div className="relative">
					<div className="absolute inset-0 flex items-center">
						<span className="w-full border-t" />
					</div>
					<div className="relative flex justify-center text-xs uppercase">
						<span className="bg-background text-muted-foreground px-2">
							Or continue with
						</span>
					</div>
				</div>

				<Button
					variant="outline"
					disabled={isLoading}
					onClick={signInWithGithub}
					className="w-full"
				>
					<FaGithub className="mr-2 size-4" />
					{isLoadingGithub ? "Loading..." : "Sign in with GitHub"}
				</Button>
				<Button
					variant="outline"
					disabled={isLoading}
					onClick={signInWithGoogle}
					className="w-full"
				>
					<FcGoogle className="mr-2 size-4" />
					{isLoadingGoogle ? "Loading..." : "Sign in with Google"}
				</Button>
				<p className="text-center text-sm">
					Don&apos;t have an account?{" "}
					<Link
						href="/sign-up"
						className="hover:text-primary underline underline-offset-4"
					>
						Sign up
					</Link>
				</p>
			</div>
		</div>
	);
}
