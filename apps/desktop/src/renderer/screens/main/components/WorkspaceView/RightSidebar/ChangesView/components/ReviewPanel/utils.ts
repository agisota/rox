import type { GitHubStatus, PullRequestComment } from "@rox/local-db";
import { LuCheck, LuLoaderCircle, LuMinus, LuX } from "react-icons/lu";

export type PullRequestCheck = NonNullable<
	GitHubStatus["pr"]
>["checks"][number];

export const ALL_COMMENTS_COPY_ACTION_KEY = "comments:all";

export const reviewDecisionConfig = {
	approved: {
		label: "Одобрено",
		className:
			"border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	},
	changes_requested: {
		label: "Запрошены правки",
		className:
			"border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
	},
	pending: {
		label: "Ожидает ревью",
		className:
			"border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
} as const;

export const checkIconConfig = {
	success: {
		icon: LuCheck,
		className: "text-emerald-600 dark:text-emerald-400",
		label: "Пройдено",
	},
	failure: {
		icon: LuX,
		className: "text-red-600 dark:text-red-400",
		label: "Не пройдено",
	},
	pending: {
		icon: LuLoaderCircle,
		className: "text-amber-600 dark:text-amber-400",
		label: "Ожидание",
	},
	skipped: {
		icon: LuMinus,
		className: "text-muted-foreground",
		label: "Пропущено",
	},
	cancelled: {
		icon: LuMinus,
		className: "text-muted-foreground",
		label: "Отменено",
	},
} as const;

export const checkSummaryIconConfig = {
	success: checkIconConfig.success,
	failure: checkIconConfig.failure,
	pending: checkIconConfig.pending,
	none: {
		icon: LuMinus,
		className: "text-muted-foreground",
		label: "Нет проверок",
	},
} as const;

export const prStateLabel = {
	open: "Открыт",
	draft: "Черновик",
	merged: "Влит",
	closed: "Закрыт",
} as const;

export function resolveCheckDestinationUrl(
	check: PullRequestCheck,
	prUrl: string,
): string | undefined {
	if (check.url) {
		return check.url;
	}

	const normalizedName = check.name.trim().toLowerCase();
	if (
		normalizedName.includes("coderabbit") ||
		normalizedName.includes("code rabbit")
	) {
		return prUrl;
	}

	return undefined;
}

export function getCommentPreviewText(body: string): string {
	return (
		body
			.replace(/<!--[\s\S]*?-->/g, "\n")
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean)
			?.replace(/^[-*+>]\s*/, "")
			?.replace(/\s+/g, " ") ?? "Предпросмотр недоступен"
	);
}

export function getCommentAvatarFallback(authorLogin: string): string {
	return authorLogin.slice(0, 2).toUpperCase();
}

export function formatShortAge(timestamp?: number): string | null {
	if (!timestamp || Number.isNaN(timestamp)) {
		return null;
	}

	const deltaMs = Math.max(0, Date.now() - timestamp);
	const deltaSeconds = Math.round(deltaMs / 1000);

	if (deltaSeconds < 60) {
		return `${Math.max(1, deltaSeconds)}с`;
	}

	const deltaMinutes = Math.round(deltaSeconds / 60);
	if (deltaMinutes < 60) {
		return `${deltaMinutes}м`;
	}

	const deltaHours = Math.round(deltaMinutes / 60);
	if (deltaHours < 24) {
		return `${deltaHours}ч`;
	}

	return `${Math.round(deltaHours / 24)}д`;
}

function getCommentClipboardLocation(
	comment: PullRequestComment,
): string | null {
	if (comment.path) {
		return comment.line ? `${comment.path}:${comment.line}` : comment.path;
	}

	return comment.kind === "conversation" ? "Обсуждение" : null;
}

export function getCommentKindText(comment: PullRequestComment): string {
	return comment.kind === "review" ? "Ревью" : "Комментарий";
}

export function buildCommentClipboardText(
	comment: PullRequestComment,
	includeMetadata = false,
): string {
	const body = comment.body.trim() || "Нет текста комментария";

	if (!includeMetadata) {
		return body;
	}

	const location = getCommentClipboardLocation(comment);
	const metadata = [
		comment.authorLogin,
		getCommentKindText(comment),
		location,
	].filter(Boolean);

	return [metadata.join(" • "), body].filter(Boolean).join("\n");
}

export function buildAllCommentsClipboardText(
	comments: PullRequestComment[],
): string {
	return comments
		.map((comment) => buildCommentClipboardText(comment, true))
		.join("\n\n---\n\n");
}

export function splitPullRequestComments(comments: PullRequestComment[]): {
	active: PullRequestComment[];
	resolved: PullRequestComment[];
} {
	return {
		active: comments.filter((comment) => comment.isResolved !== true),
		resolved: comments.filter((comment) => comment.isResolved === true),
	};
}

export function countOpenPullRequestComments(
	comments: PullRequestComment[],
): number {
	return comments.filter((comment) => comment.isResolved !== true).length;
}

export function getCommentCopyActionKey(
	commentId: PullRequestComment["id"],
): string {
	return `comment:${commentId}`;
}
