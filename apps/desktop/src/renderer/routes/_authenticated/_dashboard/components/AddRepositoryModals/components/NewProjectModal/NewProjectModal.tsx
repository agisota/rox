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
import { Shake, useMotionPreference, useShouldAnimate } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuFolderOpen, LuLoaderCircle } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { logger } from "renderer/lib/logger";
import {
	type ProjectSetupResult,
	useFinalizeProjectSetup,
} from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { WorkspaceSetupPresets } from "../WorkspaceSetupPresets";

interface NewProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess?: (result: ProjectSetupResult) => void;
	onError?: (message: string) => void;
}

function deriveProjectNameFromUrl(url: string): string {
	const trimmed = url
		.trim()
		.replace(/[?#].*$/, "")
		.replace(/[\\/]+$/, "")
		.replace(/\.git$/i, "");
	const segments = trimmed.split(/[/:\\]/).filter(Boolean);
	return segments[segments.length - 1] ?? "";
}

export function NewProjectModal({
	open,
	onOpenChange,
	onSuccess,
	onError,
}: NewProjectModalProps) {
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const finalizeSetup = useFinalizeProjectSetup();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();

	const [mode, setMode] = useState<"blank" | "clone">("blank");
	const [parentDir, setParentDir] = useState("");
	const [url, setUrl] = useState("");
	const [name, setName] = useState("");
	const [nameTouched, setNameTouched] = useState(false);
	const [starterPresetIds, setStarterPresetIds] = useState<string[]>([]);
	const [working, setWorking] = useState(false);
	const [phase, setPhase] = useState<"idle" | "success" | "error">("idle");

	const shake = useAnimationControls();
	const shouldAnimateEssential = useShouldAnimate("essential");
	const prefersMotion = useMotionPreference();
	const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (parentDir || !homeDir) return;
		setParentDir(`${homeDir}/rox/projects`);
	}, [homeDir, parentDir]);

	useEffect(() => {
		if (nameTouched) return;
		setName(deriveProjectNameFromUrl(url));
	}, [url, nameTouched]);

	useEffect(() => {
		return () => {
			if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
		};
	}, []);

	const reset = () => {
		setMode("blank");
		setUrl("");
		setName("");
		setNameTouched(false);
		setStarterPresetIds([]);
		setWorking(false);
		setPhase("idle");
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const handleBrowse = async () => {
		try {
			const result = await selectDirectory.mutateAsync({
				title: "Select project location",
				defaultPath: parentDir || undefined,
			});
			if (!result.canceled && result.path) {
				setParentDir(result.path);
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
		}
	};

	const clearErrorPhase = () => setPhase((p) => (p === "error" ? "idle" : p));

	const handleCreateResult = (result: ProjectSetupResult) => {
		if (!activeHostUrl) return;
		// Fire product callbacks immediately — no delay on product logic.
		finalizeSetup(activeHostUrl, result);
		onSuccess?.(result);
		setPhase("success");
		if (prefersMotion === "off") {
			reset();
			onOpenChange(false);
		} else {
			// Dwell briefly so the success check is visible, then close.
			dwellTimerRef.current = setTimeout(() => {
				reset();
				onOpenChange(false);
			}, 700);
		}
	};

	const handleCreateError = (err: unknown) => {
		const raw = err instanceof Error ? err.message : String(err);
		// Drizzle / pg errors arrive as "Failed query: insert into ..."
		// which is useless to a user. Hide that envelope in favor of a
		// short generic message; details land in the console for devs.
		const isLeakedSql = raw.startsWith("Failed query:");
		if (isLeakedSql) logger.error("[NewProjectModal] create failed", err);
		const message = isLeakedSql
			? "Could not create project. Please try a different name or check the logs."
			: raw;
		toast.error("Could not create project", { description: message });
		onError?.(message);
		setPhase("error");
		if (shouldAnimateEssential) {
			void shake.start({
				x: [0, -8, 8, -6, 6, 0],
				transition: { duration: 0.4 },
			});
		}
	};

	const createFromBlank = async () => {
		if (!activeHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "создать проект",
			});
			return;
		}
		const trimmedParent = parentDir.trim();
		if (!trimmedParent) {
			toast.error("Please select a project location");
			return;
		}
		const trimmedName = name.trim();
		if (!trimmedName) {
			toast.error("Please enter a project name");
			return;
		}

		setWorking(true);
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const result = await client.project.create.mutate({
				name: trimmedName,
				mode: { kind: "empty", parentDir: trimmedParent },
				starterPresetIds,
			});
			handleCreateResult(result);
		} catch (err) {
			handleCreateError(err);
		} finally {
			setWorking(false);
		}
	};

	const createFromClone = async () => {
		if (!activeHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "клонировать репозиторий",
			});
			return;
		}
		const trimmedUrl = url.trim();
		const trimmedParent = parentDir.trim();
		if (!trimmedUrl) {
			toast.error("Please enter a repository URL");
			return;
		}
		if (!trimmedParent) {
			toast.error("Please select a project location");
			return;
		}
		const trimmedName = name.trim() || deriveProjectNameFromUrl(trimmedUrl);
		if (!trimmedName) {
			toast.error("Please enter a project name");
			return;
		}

		setWorking(true);
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const result = await client.project.create.mutate({
				name: trimmedName,
				mode: { kind: "clone", parentDir: trimmedParent, url: trimmedUrl },
				starterPresetIds,
			});
			handleCreateResult(result);
		} catch (err) {
			handleCreateError(err);
		} finally {
			setWorking(false);
		}
	};

	const submit = () =>
		mode === "blank" ? createFromBlank() : createFromClone();

	return (
		<Dialog open={open} onOpenChange={handleOpenChange} modal>
			<DialogContent className="max-w-[420px]">
				<DialogHeader>
					<DialogTitle>
						{mode === "blank" ? "New project" : "Clone a repository"}
					</DialogTitle>
					<DialogDescription className="sr-only">
						Create a new blank project, or clone an existing repository.
					</DialogDescription>
				</DialogHeader>

				{/* Mode toggle: blank is the primary, no-git-required path for
				    non-developers; clone is secondary for existing repos. */}
				<div
					role="tablist"
					aria-label="Project source"
					className="grid grid-cols-2 gap-1.5 rounded-md bg-muted/40 p-1"
				>
					<Button
						type="button"
						role="tab"
						aria-selected={mode === "blank"}
						variant={mode === "blank" ? "secondary" : "ghost"}
						size="sm"
						disabled={working}
						onClick={() => {
							setMode("blank");
							clearErrorPhase();
						}}
					>
						New blank project
					</Button>
					<Button
						type="button"
						role="tab"
						aria-selected={mode === "clone"}
						variant={mode === "clone" ? "secondary" : "ghost"}
						size="sm"
						disabled={working}
						onClick={() => {
							setMode("clone");
							clearErrorPhase();
						}}
					>
						Clone a repository
					</Button>
				</div>

				{/* Error shake wraps the form fields */}
				<Shake controls={shake} className="flex flex-col gap-4">
					{mode === "clone" && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="clone-url" className="text-xs">
								Repository URL or path
							</Label>
							<Input
								id="clone-url"
								value={url}
								onChange={(e) => {
									setUrl(e.target.value);
									clearErrorPhase();
								}}
								placeholder="https://github.com/owner/repo.git or /path/to/repo"
								disabled={working}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !working) {
										void submit();
									}
								}}
								autoFocus
							/>
						</div>
					)}

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="project-name" className="text-xs">
							Project name
						</Label>
						<Input
							id="project-name"
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								setNameTouched(true);
								clearErrorPhase();
							}}
							placeholder="my-project"
							disabled={working}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !working) {
									void submit();
								}
							}}
							autoFocus={mode === "blank"}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="project-path" className="text-xs">
							Location
						</Label>
						<div className="flex gap-1.5">
							<Input
								id="project-path"
								value={parentDir}
								onChange={(e) => setParentDir(e.target.value)}
								disabled={working}
								className="flex-1 font-mono text-xs"
							/>
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={handleBrowse}
								disabled={working || selectDirectory.isPending}
								className="shrink-0"
								aria-label="Browse for directory"
							>
								<LuFolderOpen className="size-4" />
							</Button>
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<Label className="text-xs">Starter presets</Label>
						<WorkspaceSetupPresets
							selectedIds={starterPresetIds}
							onChange={setStarterPresetIds}
							className="max-h-56 overflow-y-auto rounded-md border border-border/60 p-1"
						/>
					</div>
				</Shake>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => handleOpenChange(false)}
						disabled={working}
					>
						Cancel
					</Button>
					<Button onClick={() => void submit()} disabled={working}>
						{/* Crossfaded label: idle ↔ working… ↔ done ✓ */}
						<AnimatePresence mode="wait" initial={false}>
							{working ? (
								<motion.span
									key="working"
									className="flex items-center gap-1.5"
									initial={{ opacity: 0, y: 4 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -4 }}
									transition={{ duration: 0.12 }}
								>
									<LuLoaderCircle className="size-4 animate-spin" />
									{mode === "blank" ? "Creating…" : "Cloning…"}
								</motion.span>
							) : phase === "success" ? (
								<motion.span
									key="success"
									className="flex items-center gap-1.5"
									initial={{ scale: 0.6, opacity: 0 }}
									animate={{ scale: 1, opacity: 1 }}
									exit={{ opacity: 0, scale: 0.8 }}
									transition={{ type: "spring", stiffness: 520, damping: 36 }}
								>
									<LuCheck className="size-4" />
									{mode === "blank" ? "Created" : "Cloned"}
								</motion.span>
							) : (
								<motion.span
									key="idle"
									initial={{ opacity: 0, y: 4 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -4 }}
									transition={{ duration: 0.12 }}
								>
									{mode === "blank" ? "Create project" : "Clone"}
								</motion.span>
							)}
						</AnimatePresence>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
