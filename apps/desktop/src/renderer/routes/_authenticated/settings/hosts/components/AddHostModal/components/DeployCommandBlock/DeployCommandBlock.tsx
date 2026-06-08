import { cn } from "@rox/ui/utils";
import { useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";

interface DeployCommandBlockProps {
	command: string;
	className?: string;
}

/**
 * Renders a copyable shell command (e.g. `rox deploy …`) used in the
 * Add-host modal for self-deploy flows.
 */
export function DeployCommandBlock({
	command,
	className,
}: DeployCommandBlockProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		void navigator.clipboard.writeText(command).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	};

	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2",
				className,
			)}
		>
			<code className="flex-1 truncate font-mono text-xs">{command}</code>
			<button
				type="button"
				onClick={handleCopy}
				aria-label="Copy command"
				className="shrink-0 text-muted-foreground hover:text-foreground"
			>
				{copied ? (
					<LuCheck className="size-4 text-emerald-500" />
				) : (
					<LuCopy className="size-4" />
				)}
			</button>
		</div>
	);
}
