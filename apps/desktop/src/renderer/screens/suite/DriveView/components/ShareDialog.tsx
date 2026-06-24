import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { CompletionBurst } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { env } from "renderer/env.renderer";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { buildShareUrl } from "../utils/buildShareUrl";

export interface ShareTarget {
	kind: "file" | "folder";
	id: string;
	name: string;
}

interface ShareDialogProps {
	target: ShareTarget | null;
	onOpenChange: (open: boolean) => void;
}

/**
 * Create a public share for a file or folder and surface the copyable
 * `app.rox.one/d/<token>` link. Ported from the web `ShareDialog`; the base url
 * now comes from the desktop renderer env (`NEXT_PUBLIC_WEB_URL`) via
 * {@link buildShareUrl}, replacing the old DriveView stub's hardcoded constant.
 * An optional password gates the public landing page.
 */
export function ShareDialog({ target, onOpenChange }: ShareDialogProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [password, setPassword] = useState("");
	const [createdToken, setCreatedToken] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const createShare = useMutation(
		trpc.drive.createShare.mutationOptions({
			onSuccess: async (share) => {
				setCreatedToken(share?.token ?? null);
				await queryClient.invalidateQueries({
					queryKey: trpc.drive.listShares.queryKey(),
				});
				toast.success("Ссылка создана");
			},
			onError: (error) => {
				toast.error(error.message || "Не удалось создать ссылку");
			},
		}),
	);

	const handleClose = (open: boolean) => {
		if (!open) {
			setPassword("");
			setCreatedToken(null);
			setCopied(false);
		}
		onOpenChange(open);
	};

	const handleCreate = () => {
		if (!target) return;
		createShare.mutate({
			...(target.kind === "file"
				? { fileId: target.id }
				: { folderId: target.id }),
			...(password.trim().length > 0 ? { password: password.trim() } : {}),
		});
	};

	const shareUrl = createdToken
		? buildShareUrl(createdToken, env.NEXT_PUBLIC_WEB_URL)
		: null;

	const handleCopy = async () => {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			toast.error("Не удалось скопировать ссылку");
		}
	};

	return (
		<Dialog open={target !== null} onOpenChange={handleClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Поделиться</DialogTitle>
					<DialogDescription className="truncate">
						{target?.name}
					</DialogDescription>
				</DialogHeader>

				{shareUrl ? (
					<div className="space-y-2">
						<Label htmlFor="drive-share-link">Публичная ссылка</Label>
						<div className="flex items-center gap-2">
							<Input
								id="drive-share-link"
								readOnly
								value={shareUrl}
								className="cursor-text select-text font-mono text-xs"
								onFocus={(event) => event.currentTarget.select()}
							/>
							<div className="relative">
								<Button
									type="button"
									variant="outline"
									size="icon"
									onClick={handleCopy}
									aria-label="Скопировать ссылку"
								>
									{copied ? (
										<Check className="size-4" />
									) : (
										<Copy className="size-4" />
									)}
								</Button>
								{copied ? (
									<span className="pointer-events-none absolute inset-0 flex items-center justify-center">
										<CompletionBurst size={10} />
									</span>
								) : null}
							</div>
						</div>
						{password.trim().length > 0 ? (
							<p className="text-muted-foreground text-xs">
								Ссылка защищена паролем.
							</p>
						) : null}
					</div>
				) : (
					<div className="space-y-2">
						<Label htmlFor="drive-share-password">Пароль (необязательно)</Label>
						<Input
							id="drive-share-password"
							type="password"
							placeholder="Без пароля"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") handleCreate();
							}}
						/>
						<p className="text-muted-foreground text-xs">
							Любой, у кого есть ссылка, сможет открыть{" "}
							{target?.kind === "folder" ? "папку" : "файл"}.
						</p>
					</div>
				)}

				<DialogFooter>
					{shareUrl ? (
						<Button type="button" onClick={() => handleClose(false)}>
							Готово
						</Button>
					) : (
						<Button
							type="button"
							onClick={handleCreate}
							disabled={createShare.isPending}
						>
							{createShare.isPending ? "Создание…" : "Создать ссылку"}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
