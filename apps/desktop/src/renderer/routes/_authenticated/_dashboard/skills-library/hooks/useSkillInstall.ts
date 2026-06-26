/**
 * Adapter hook: install a curated catalog pack into `~/.claude/skills`.
 *
 * Wraps the local electron-tRPC `skillsLibrary.install` mutation (which extracts
 * the pack's skills from the app's bundled preinstall archive — no network) and
 * refreshes `skillsLibrary.list` on success so the catalog re-derives install
 * state and the installed list/inspector pick the new skills up immediately.
 */

import { toast } from "@rox/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface UseSkillInstallArgs {
	/** Called after a successful install with the landed skill directory names. */
	onInstalled?: (result: { slug: string; installed: string[] }) => void;
}

export function useSkillInstall({ onInstalled }: UseSkillInstallArgs = {}) {
	const utils = electronTrpc.useUtils();
	const install = electronTrpc.skillsLibrary.install.useMutation({
		onSuccess: async (result) => {
			await utils.skillsLibrary.list.invalidate();
			const count = result.installed.length;
			toast.success(
				count === 1
					? `Скилл «${result.installed[0]}» установлен`
					: `Установлено скиллов: ${count} (пакет «${result.slug}»)`,
			);
			onInstalled?.({ slug: result.slug, installed: result.installed });
		},
		onError: (error) =>
			toast.error(`Не удалось установить пакет: ${error.message}`),
	});

	return {
		/** Trigger an install for a catalog pack by its slug. */
		installPack: (slug: string) => install.mutate({ slug }),
		/** Whether an install is currently running. */
		isInstalling: install.isPending,
		/** The slug currently being installed (for per-card spinners). */
		installingSlug: install.isPending
			? (install.variables?.slug ?? null)
			: null,
	};
}
