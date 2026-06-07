import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useCallback } from "react";
import { FileIcon } from "renderer/lib/fileIcons";
import { ease, motionDuration, useShouldAnimate } from "renderer/motion";
import type { ChangesetFile } from "../../../../../useChangeset";

interface DiffHeaderPrefixProps {
	file: ChangesetFile;
	collapsed: boolean;
	onSetCollapsed: (path: string, value: boolean) => void;
}

export function DiffHeaderPrefix({
	file,
	collapsed,
	onSetCollapsed,
}: DiffHeaderPrefixProps) {
	const onToggle = useCallback(
		() => onSetCollapsed(file.path, !collapsed),
		[onSetCollapsed, file.path, collapsed],
	);

	const shouldAnimate = useShouldAnimate();

	return (
		// Flex wrapper: Tailwind preflight sets `img { display: block }`,
		// so without this the FileIcon drops below the chevron button.
		<div className="flex shrink-0 items-center gap-1">
			<button
				type="button"
				onClick={onToggle}
				aria-label={collapsed ? "Expand file" : "Collapse file"}
				className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
			>
				<motion.span
					style={{ display: "inline-flex" }}
					animate={{ rotate: collapsed ? -90 : 0 }}
					initial={false}
					transition={
						shouldAnimate
							? { duration: motionDuration.fast, ease: ease.standard }
							: { duration: 0 }
					}
				>
					<ChevronDown className="size-3.5" />
				</motion.span>
			</button>
			<FileIcon fileName={file.path} className="size-3.5 shrink-0" />
		</div>
	);
}
