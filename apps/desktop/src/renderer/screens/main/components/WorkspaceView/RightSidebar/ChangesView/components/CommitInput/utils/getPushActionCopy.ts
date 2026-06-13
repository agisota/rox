import type { GitHubStatus } from "@rox/local-db";

type PushActionPullRequest = Pick<
	NonNullable<GitHubStatus["pr"]>,
	"headRefName" | "headRepositoryOwner"
>;

export interface PushActionCopy {
	label: string;
	menuLabel: string;
	tooltip: string;
}

function formatPullRequestPushTarget(
	pullRequest?: PushActionPullRequest | null,
): string | null {
	const branch = pullRequest?.headRefName?.trim();
	if (!branch) {
		return null;
	}

	const owner = pullRequest?.headRepositoryOwner?.trim();
	return owner ? `${owner}:${branch}` : branch;
}

export function getPushActionCopy({
	hasUpstream,
	pushCount,
	pullRequest,
}: {
	hasUpstream: boolean;
	pushCount: number;
	pullRequest?: PushActionPullRequest | null;
}): PushActionCopy {
	const pullRequestTarget = formatPullRequestPushTarget(pullRequest);
	if (pullRequestTarget) {
		return {
			label: "Отправить в PR",
			menuLabel: "Отправить в PR",
			tooltip:
				pushCount > 0
					? `Отправить коммитов в ${pullRequestTarget}: ${pushCount}`
					: `Отправить изменения в ${pullRequestTarget}`,
		};
	}

	if (!hasUpstream) {
		return {
			label: "Опубликовать ветку",
			menuLabel: "Опубликовать ветку",
			tooltip: "Опубликовать ветку в удалённом репозитории",
		};
	}

	return {
		label: "Отправить",
		menuLabel: "Отправить",
		tooltip:
			pushCount > 0
				? `Отправить коммитов: ${pushCount}`
				: "Отправить изменения ветки",
	};
}
