import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface GitHubPublishTarget {
	projectId: string;
	/**
	 * Suggested repo name (project/folder name); user can edit before
	 * publishing. May be empty — the dialog then derives a default from the
	 * project's on-disk folder name.
	 */
	suggestedName?: string;
}

interface GitHubPublishState {
	target: GitHubPublishTarget | null;
	/** Open the optional "publish to GitHub" dialog for a freshly-created project. */
	open: (target: GitHubPublishTarget) => void;
	close: () => void;
}

/**
 * Drives the optional, post-create "Создать репозиторий на GitHub" dialog. The
 * dialog is purely additive — onboarding finishes a fully working local project
 * with no remote, and this lets a user with `gh` installed + authenticated push
 * it to a new GitHub repo afterwards. Callers should only open it when
 * `system.detectGhCli` reports installed && authenticated.
 */
export const useGitHubPublishStore = create<GitHubPublishState>()(
	devtools(
		(set) => ({
			target: null,
			open: (target) => set({ target }),
			close: () => set({ target: null }),
		}),
		{ name: "github-publish" },
	),
);

export const useGitHubPublishTarget = () =>
	useGitHubPublishStore((state) => state.target);
export const useOpenGitHubPublish = () =>
	useGitHubPublishStore((state) => state.open);
export const useCloseGitHubPublish = () =>
	useGitHubPublishStore((state) => state.close);
