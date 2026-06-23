import { cn } from "@rox/ui/utils";
import { useState } from "react";

interface ProjectThumbnailProps {
	projectName: string;
	iconUrl?: string | null;
	className?: string;
}

/**
 * The icon-vs-fallback render decision for a project thumbnail, derived purely
 * from props + the "this icon URL failed to load" state. Extracted so the
 * resolution logic is unit-testable without a DOM (mirrors
 * `shouldShowGitHubAvatar`).
 *
 * Renders the icon when `iconUrl` is a non-empty, resolvable URL that has not
 * previously errored — this includes the demo project's self-contained
 * `data:image/svg+xml` pizdariki URL seeded into `v2_projects.icon_url`
 * (issue #26), as well as `rox-icon://` and `https://` URLs. Otherwise falls
 * back to the project name's first letter.
 */
export type ProjectThumbnailDisplay =
	| { kind: "icon"; src: string }
	| { kind: "fallback"; letter: string };

export function resolveProjectThumbnailDisplay({
	projectName,
	iconUrl,
	failedUrl,
}: {
	projectName: string;
	iconUrl: string | null | undefined;
	failedUrl: string | null;
}): ProjectThumbnailDisplay {
	if (iconUrl && failedUrl !== iconUrl) {
		return { kind: "icon", src: iconUrl };
	}
	return { kind: "fallback", letter: projectName.charAt(0).toUpperCase() };
}

export function ProjectThumbnail({
	projectName,
	iconUrl,
	className,
}: ProjectThumbnailProps) {
	const [failedUrl, setFailedUrl] = useState<string | null>(null);

	const display = resolveProjectThumbnailDisplay({
		projectName,
		iconUrl,
		failedUrl,
	});

	if (display.kind === "icon") {
		return (
			<div
				className={cn(
					"relative size-6 rounded-sm overflow-hidden flex-shrink-0 bg-muted border border-foreground/10",
					className,
				)}
			>
				<img
					src={display.src}
					alt={`${projectName} icon`}
					className="size-full object-cover"
					onError={() => setFailedUrl(display.src)}
				/>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"size-6 rounded-sm flex items-center justify-center flex-shrink-0",
				"text-xs font-medium bg-muted text-muted-foreground border border-foreground/10",
				className,
			)}
		>
			{display.letter}
		</div>
	);
}
