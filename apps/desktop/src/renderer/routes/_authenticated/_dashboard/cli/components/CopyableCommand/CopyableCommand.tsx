import { Button } from "@rox/ui/button";
import { useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";

interface CopyableCommandProps {
	command: string;
}

/**
 * A monospace command chip with a copy-to-clipboard button. The command text
 * is explicitly selectable (the renderer sets `user-select: none` on body).
 */
export function CopyableCommand({ command }: CopyableCommandProps) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(command);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard can fail without focus/permission — ignore silently.
		}
	};

	return (
		<div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 py-1.5 pl-3 pr-1.5">
			<code className="select-text cursor-text truncate font-mono text-[13px] text-foreground">
				{command}
			</code>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				onClick={copy}
				aria-label="Копировать"
				className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
			>
				{copied ? (
					<LuCheck className="size-3.5" />
				) : (
					<LuCopy className="size-3.5" />
				)}
			</Button>
		</div>
	);
}
