import { githubAvatarUrl } from "@superset/shared/github-remote";
import { cn } from "@superset/ui/utils";
import { useState } from "react";

interface V2WorkspaceProjectIconProps {
	projectName: string;
	githubOwner: string | null;
	size?: "sm" | "md";
	className?: string;
}

const SIZE_CLASSES: Record<
	NonNullable<V2WorkspaceProjectIconProps["size"]>,
	string
> = {
	sm: "size-5 text-[10px]",
	md: "size-6 text-xs",
};

export function V2WorkspaceProjectIcon({
	projectName,
	githubOwner,
	size = "md",
	className,
}: V2WorkspaceProjectIconProps) {
	const [failedOwner, setFailedOwner] = useState<string | null>(null);
	const imageFailed = githubOwner != null && failedOwner === githubOwner;
	const dimensions = SIZE_CLASSES[size];
	const showImage = githubOwner != null && !imageFailed;

	if (showImage) {
		return (
			<div
				className={cn(
					"relative shrink-0 overflow-hidden rounded border border-border bg-muted",
					dimensions,
					className,
				)}
			>
				<img
					src={githubAvatarUrl(githubOwner, 64)}
					alt=""
					aria-hidden
					className="size-full object-cover"
					onError={() => setFailedOwner(githubOwner)}
				/>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex shrink-0 items-center justify-center rounded border border-border bg-muted font-medium text-muted-foreground",
				dimensions,
				className,
			)}
			aria-hidden
		>
			{projectName.charAt(0).toUpperCase() || "?"}
		</div>
	);
}
