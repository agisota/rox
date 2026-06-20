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
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { useEffect, useState } from "react";
import { LuGithub, LuLoaderCircle } from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	useCloseGitHubPublish,
	useGitHubPublishTarget,
} from "renderer/stores/github-publish";

type Visibility = "private" | "public";

/**
 * Optional, post-create "publish to GitHub" dialog. Rendered once in
 * AddRepositoryModals and opened via the github-publish store only when
 * `system.detectGhCli` reports gh installed && authenticated. Wraps the
 * host-service `project.createGitHubRepo` procedure (`gh repo create … --push`).
 * Fully dismissible and non-blocking — the local project already works.
 */
export function GitHubPublishDialog() {
	const target = useGitHubPublishTarget();
	const close = useCloseGitHubPublish();
	const { activeHostUrl } = useLocalHostService();

	const [name, setName] = useState("");
	const [visibility, setVisibility] = useState<Visibility>("private");
	const [working, setWorking] = useState(false);

	useEffect(() => {
		if (target) {
			setName(target.suggestedName ?? "");
			setVisibility("private");
			setWorking(false);
		}
	}, [target]);

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) close();
	};

	const handlePublish = async () => {
		if (!target || !activeHostUrl) return;
		const trimmed = name.trim();
		setWorking(true);
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const result = await client.project.createGitHubRepo.mutate({
				projectId: target.projectId,
				visibility,
				// Empty → let the host service default to the on-disk folder name.
				name: trimmed || undefined,
			});
			toast.success("Репозиторий создан на GitHub", {
				description: result.repoUrl ?? undefined,
			});
			close();
		} catch (err) {
			toast.error("Не удалось создать репозиторий", {
				description: err instanceof Error ? err.message : String(err),
			});
			setWorking(false);
		}
	};

	return (
		<Dialog open={target !== null} onOpenChange={handleOpenChange} modal>
			<DialogContent className="max-w-[420px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<LuGithub className="size-4" />
						Создать репозиторий на GitHub
					</DialogTitle>
					<DialogDescription>
						Проект создан локально. Опубликуйте его в новом репозитории GitHub —
						это необязательно.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="gh-repo-name" className="text-xs">
							Имя репозитория
						</Label>
						<Input
							id="gh-repo-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="my-project"
							disabled={working}
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter" && !working) void handlePublish();
							}}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label className="text-xs">Видимость</Label>
						<div className="grid grid-cols-2 gap-2">
							{(["private", "public"] as const).map((value) => {
								const selected = visibility === value;
								return (
									<button
										key={value}
										type="button"
										disabled={working}
										onClick={() => setVisibility(value)}
										className={cn(
											"rounded-md border px-3 py-2 text-sm transition-colors",
											selected
												? "border-primary/50 bg-primary/5 text-foreground"
												: "border-border/50 text-muted-foreground hover:border-border hover:bg-accent/30",
										)}
									>
										{value === "private" ? "Приватный" : "Публичный"}
									</button>
								);
							})}
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => handleOpenChange(false)}
						disabled={working}
					>
						Не сейчас
					</Button>
					<Button onClick={() => void handlePublish()} disabled={working}>
						{working ? (
							<span className="flex items-center gap-1.5">
								<LuLoaderCircle className="size-4 animate-spin" />
								Публикация…
							</span>
						) : (
							"Создать и запушить"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
