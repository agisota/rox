"use client";

import { authClient } from "@rox/auth/client";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import Link from "next/link";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { env } from "@/env";

export default function SignUpPage() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLoadingEmail, setIsLoadingEmail] = useState(false);
	const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
	const [isLoadingGithub, setIsLoadingGithub] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isLoading = isLoadingGoogle || isLoadingGithub || isLoadingEmail;

	const signUpWithEmail = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoadingEmail(true);
		setError(null);
		try {
			const res = await authClient.signUp.email({ name, email, password });
			if (res.error) throw new Error(res.error.message ?? "Sign up failed");
			window.location.href = env.NEXT_PUBLIC_WEB_URL;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to sign up.");
			setIsLoadingEmail(false);
		}
	};

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
			setError("Failed to sign up. Please try again.");
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
			setError("Failed to sign up. Please try again.");
			setIsLoadingGithub(false);
		}
	};

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Create an account
				</h1>
				<p className="text-muted-foreground text-sm">
					Sign up to get started with Rox
				</p>
			</div>
			<div className="grid gap-4">
				{error && (
					<p className="text-destructive text-center text-sm">{error}</p>
				)}

				<form onSubmit={signUpWithEmail} className="grid gap-3">
					<div className="grid gap-1.5">
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							type="text"
							autoComplete="name"
							placeholder="Your name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							disabled={isLoading}
						/>
					</div>
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
							autoComplete="new-password"
							placeholder="At least 8 characters"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							minLength={8}
							disabled={isLoading}
						/>
					</div>
					<Button type="submit" disabled={isLoading} className="w-full">
						{isLoadingEmail ? "Creating account..." : "Create account"}
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
					onClick={signUpWithGithub}
					className="w-full"
				>
					<FaGithub className="mr-2 size-4" />
					{isLoadingGithub ? "Loading..." : "Sign up with GitHub"}
				</Button>
				<Button
					variant="outline"
					disabled={isLoading}
					onClick={signUpWithGoogle}
					className="w-full"
				>
					<FcGoogle className="mr-2 size-4" />
					{isLoadingGoogle ? "Loading..." : "Sign up with Google"}
				</Button>
				<p className="text-center text-sm">
					Already have an account?{" "}
					<Link
						href="/sign-in"
						className="hover:text-primary underline underline-offset-4"
					>
						Sign in
					</Link>
				</p>
			</div>
		</div>
	);
}
