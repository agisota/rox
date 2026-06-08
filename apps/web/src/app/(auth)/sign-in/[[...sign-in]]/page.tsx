"use client";

import { authClient } from "@rox/auth/client";
import { isLocalOnlyAuth } from "@rox/auth/local-only";
import { DEV_EMAIL, DEV_NAME, DEV_PASSWORD } from "@rox/shared/dev-credentials";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { env } from "@/env";
import { useTranslation } from "@/i18n";

// Web sign-in is OAuth-only (GitHub/Google + dev Local Admin). The email/password
// flow is intentionally hidden behind this flag rather than deleted so it can be
// re-enabled if self-serve email auth is reintroduced.
const showEmailPassword = false;

// Self-hosted/offline builds (LOCAL_ONLY_AUTH) authenticate against the local
// email/password path only: surface the email form + Local Admin shortcut and
// drop the external OAuth buttons. Cloud builds (flag off) are unchanged.
const localOnlyAuth = isLocalOnlyAuth();

export default function SignInPage() {
	const { t } = useTranslation();
	const searchParams = useSearchParams();
	const redirect = searchParams.get("redirect");
	const callbackURL = redirect
		? `${env.NEXT_PUBLIC_WEB_URL}${redirect}`
		: env.NEXT_PUBLIC_WEB_URL;

	const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
	const [isLoadingGithub, setIsLoadingGithub] = useState(false);
	const [isLoadingEmail, setIsLoadingEmail] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);

	const signInWithEmail = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsLoadingEmail(true);
		setError(null);

		try {
			const res = await authClient.signIn.email({
				email,
				password,
				callbackURL,
			});
			if (res.error) {
				if (res.error.status === 403) {
					throw new Error(
						"Please verify your email before signing in. Check your inbox for the verification link.",
					);
				}
				throw new Error(res.error.message ?? "Invalid email or password.");
			}
			window.location.href = callbackURL;
		} catch (err) {
			console.error("Sign in failed:", err);
			setError(err instanceof Error ? err.message : "Failed to sign in.");
			setIsLoadingEmail(false);
		}
	};

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
			setError("Failed to sign in. Please try again.");
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
			setError("Failed to sign in. Please try again.");
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
			setError(err instanceof Error ? err.message : "Dev sign-in failed");
			setIsLoadingDev(false);
		}
	};

	const isLoading =
		isLoadingGoogle || isLoadingGithub || isLoadingDev || isLoadingEmail;

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					{t.auth.welcomeBack}
				</h1>
				<p className="text-muted-foreground text-sm">
					{t.auth.signInToContinue}
				</p>
			</div>
			<div className="grid gap-4">
				{error && (
					<p className="text-destructive text-center text-sm">{error}</p>
				)}
				{(process.env.NODE_ENV === "development" || localOnlyAuth) && (
					<Button
						variant="outline"
						disabled={isLoading}
						onClick={signInAsDev}
						className="w-full"
					>
						{isLoadingDev ? t.auth.signingIn : t.auth.signInAsDev}
					</Button>
				)}
				{(showEmailPassword || localOnlyAuth) && (
					<>
						<form onSubmit={signInWithEmail} className="grid gap-3">
							<div className="grid gap-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									autoComplete="email"
									placeholder="you@example.com"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									required
									disabled={isLoading}
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="password">Password</Label>
								<Input
									id="password"
									type="password"
									autoComplete="current-password"
									placeholder="Your password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									required
									disabled={isLoading}
								/>
							</div>
							<Button type="submit" disabled={isLoading} className="w-full">
								{isLoadingEmail ? "Signing in..." : "Sign in with email"}
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
					</>
				)}
				{!localOnlyAuth && (
					<>
						<Button
							variant="outline"
							disabled={isLoading}
							onClick={signInWithGithub}
							className="w-full"
						>
							<FaGithub className="mr-2 size-4" />
							{isLoadingGithub ? t.auth.loading : t.auth.signInWithGithub}
						</Button>
						<Button
							variant="outline"
							disabled={isLoading}
							onClick={signInWithGoogle}
							className="w-full"
						>
							<FcGoogle className="mr-2 size-4" />
							{isLoadingGoogle ? t.auth.loading : t.auth.signInWithGoogle}
						</Button>
					</>
				)}
				<p className="text-muted-foreground px-8 text-center text-sm">
					{t.auth.agreeToTerms}{" "}
					<a
						href={`${env.NEXT_PUBLIC_MARKETING_URL}/terms`}
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-primary underline underline-offset-4"
					>
						{t.auth.termsOfService}
					</a>{" "}
					{t.auth.and}{" "}
					<a
						href={`${env.NEXT_PUBLIC_MARKETING_URL}/privacy`}
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-primary underline underline-offset-4"
					>
						{t.auth.privacyPolicy}
					</a>
					.
				</p>
				<p className="text-center text-sm">
					{t.auth.dontHaveAccount}{" "}
					<Link
						href="/sign-up"
						className="hover:text-primary underline underline-offset-4"
					>
						{t.auth.signUp}
					</Link>
				</p>
			</div>
		</div>
	);
}
