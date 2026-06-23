"use client";

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
import { useMutation } from "@tanstack/react-query";
import { Download, FileText, Folder, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { formatBytes } from "../../../../drive/utils/formatBytes";

interface ShareLandingProps {
	token: string;
}

/**
 * Public landing page for `rox.one/d/<token>`. Resolves the share via the public
 * `drive.resolveShare` procedure: on success it shows the file metadata + a
 * download button (file shares) or a folder notice (folder shares are
 * metadata-only in P0). A password-protected share prompts for a password and
 * re-resolves. No session is required.
 */
export function ShareLanding({ token }: ShareLandingProps) {
	const trpc = useTRPC();
	const [password, setPassword] = useState("");
	const [needsPassword, setNeedsPassword] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const attemptedInitial = useRef(false);

	const resolveShare = useMutation(
		trpc.drive.resolveShare.mutationOptions({
			onError: (error) => {
				if (error.data?.code === "UNAUTHORIZED") {
					setNeedsPassword(true);
					setErrorMessage(password.length > 0 ? "Неверный пароль." : null);
					return;
				}
				setErrorMessage(
					error.message || "Не удалось открыть ссылку. Возможно, она истекла.",
				);
			},
		}),
	);

	// Auto-resolve once on mount (covers the no-password case).
	useEffect(() => {
		if (attemptedInitial.current) return;
		attemptedInitial.current = true;
		resolveShare.mutate({ token });
	}, [resolveShare, token]);

	const result = resolveShare.data;

	const submitPassword = (event: React.FormEvent) => {
		event.preventDefault();
		setErrorMessage(null);
		resolveShare.mutate({ token, password });
	};

	const startDownload = (url: string) => {
		window.location.href = url;
	};

	// Loading: first attempt in flight, nothing resolved yet, no password gate.
	if (resolveShare.isPending && !result && !needsPassword) {
		return (
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Открываем ссылку…</CardTitle>
				</CardHeader>
			</Card>
		);
	}

	if (result?.kind === "file" && result.download) {
		return (
			<Card className="w-full max-w-md">
				<CardHeader>
					<div className="flex items-center gap-2">
						<FileText className="size-5 text-muted-foreground" />
						<CardTitle className="truncate">{result.name}</CardTitle>
					</div>
					<CardDescription>
						{formatBytes(result.sizeBytes)} · {result.mediaType}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						type="button"
						className="w-full"
						onClick={() => startDownload(result.download.url)}
					>
						<Download className="size-4" />
						Скачать
					</Button>
				</CardContent>
			</Card>
		);
	}

	if (result?.kind === "folder") {
		return (
			<Card className="w-full max-w-md">
				<CardHeader>
					<div className="flex items-center gap-2">
						<Folder className="size-5 text-muted-foreground" />
						<CardTitle>Папка</CardTitle>
					</div>
					<CardDescription>
						Это публичная папка. Скачивание папок целиком пока недоступно.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	if (needsPassword) {
		return (
			<Card className="w-full max-w-md">
				<CardHeader>
					<div className="flex items-center gap-2">
						<Lock className="size-5 text-muted-foreground" />
						<CardTitle>Требуется пароль</CardTitle>
					</div>
					<CardDescription>Эта ссылка защищена паролем.</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="space-y-3" onSubmit={submitPassword}>
						<div className="space-y-2">
							<Label htmlFor="share-password">Пароль</Label>
							<Input
								id="share-password"
								type="password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								autoFocus
							/>
						</div>
						{errorMessage ? (
							<p className="text-destructive text-sm">{errorMessage}</p>
						) : null}
						<Button
							type="submit"
							className="w-full"
							disabled={resolveShare.isPending || password.length === 0}
						>
							{resolveShare.isPending ? "Проверяем…" : "Открыть"}
						</Button>
					</form>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Ссылка недоступна</CardTitle>
				<CardDescription>
					{errorMessage ??
						"Эта ссылка не найдена, отозвана или срок её действия истёк."}
				</CardDescription>
			</CardHeader>
		</Card>
	);
}
