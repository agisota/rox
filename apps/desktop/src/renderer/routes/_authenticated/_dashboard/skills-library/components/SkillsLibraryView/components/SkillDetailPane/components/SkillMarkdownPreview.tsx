/**
 * Read-only markdown preview for the "Просмотр" tab (SKILL.md and other .md).
 *
 * Uses the same `streamdown` renderer the chat uses (shiki code blocks,
 * headings, lists, tables) so the preview is visually consistent with the rest
 * of Rox. `mode="static"` — no streaming animation, this is a settled document.
 */

import { ScrollArea } from "@rox/ui/scroll-area";
import { Streamdown } from "streamdown";

interface SkillMarkdownPreviewProps {
	content: string;
}

export function SkillMarkdownPreview({ content }: SkillMarkdownPreviewProps) {
	return (
		<ScrollArea className="h-full min-h-0">
			<div className="px-6 py-4">
				<Streamdown
					mode="static"
					className="max-w-none text-sm text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-primary [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium [&_ol]:list-outside [&_ol]:pl-6 [&_ul]:list-outside [&_ul]:pl-6 [&_code]:font-mono"
				>
					{content}
				</Streamdown>
			</div>
		</ScrollArea>
	);
}
