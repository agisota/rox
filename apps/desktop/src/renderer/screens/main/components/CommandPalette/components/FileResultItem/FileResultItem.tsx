import { CommandPrimitive } from "@rox/ui/command";
import { motion } from "framer-motion";
import { FileIcon } from "renderer/lib/fileIcons";
import { fileRowOpeningAnimation, useShouldAnimate } from "renderer/motion";

interface FileResultItemProps {
	value: string;
	fileName: string;
	relativePath: string;
	onSelect: () => void;
	/** True for the single row currently being opened — plays the exit flourish. */
	isOpening?: boolean;
	/** Shared layout namespace (see `fileLayoutId`) for the open-file transition. */
	layoutId?: string;
}

// cmdk's `Command.Item` forwards its ref to a styled <div>, so it can be wrapped
// directly with framer-motion (no `asChild` needed). The wrapper preserves the
// `value`/`onSelect`/`data-[selected=true]` cmdk contract untouched.
const MotionCommandItem = motion.create(CommandPrimitive.Item);

const ITEM_CLASS =
	"group data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export function FileResultItem({
	value,
	fileName,
	relativePath,
	onSelect,
	isOpening = false,
	layoutId,
}: FileResultItemProps) {
	const shouldAnimate = useShouldAnimate("essential");
	const animateOpening = shouldAnimate && isOpening;

	const inner = (
		<>
			<FileIcon fileName={fileName} className="size-3.5 shrink-0" />
			<span className="max-w-[252px] truncate font-medium">{fileName}</span>
			<span className="truncate text-muted-foreground text-xs">
				{relativePath}
			</span>
			<kbd className="ml-auto hidden shrink-0 text-xs text-muted-foreground group-data-[selected=true]:block">
				↵
			</kbd>
		</>
	);

	// Reduced motion (or any non-opening row): render the plain cmdk item so
	// keyboard nav / selection behaviour is byte-for-byte identical to before.
	if (!animateOpening) {
		return (
			<CommandPrimitive.Item
				value={value}
				onSelect={onSelect}
				className={ITEM_CLASS}
			>
				{inner}
			</CommandPrimitive.Item>
		);
	}

	return (
		<MotionCommandItem
			value={value}
			onSelect={onSelect}
			className={ITEM_CLASS}
			layout
			layoutId={layoutId}
			animate={fileRowOpeningAnimation.animate}
			transition={fileRowOpeningAnimation.transition}
		>
			{inner}
		</MotionCommandItem>
	);
}
