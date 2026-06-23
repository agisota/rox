import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@rox/ui/hover-card";
import { motionSpring, useShouldAnimate } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface ImageHoverPreviewProps {
	src: string;
	alt?: string;
	filename?: string;
	mediaType?: string;
	triggerClassName?: string;
	children: ReactNode;
}

export function ImageHoverPreview({
	src,
	alt,
	filename,
	mediaType,
	triggerClassName,
	children,
}: ImageHoverPreviewProps) {
	const shouldAnimate = useShouldAnimate("decorative");
	return (
		<HoverCard openDelay={200} closeDelay={50}>
			<HoverCardTrigger asChild>
				<span className={cn("inline-flex max-w-full", triggerClassName)}>
					{children}
				</span>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-auto p-2">
				<div className="w-auto space-y-3">
					<div className="relative flex max-h-96 w-96 items-center justify-center overflow-hidden rounded-md border">
						<motion.img
							alt={alt ?? filename ?? "image preview"}
							className="max-h-full max-w-full object-contain"
							src={src}
							initial={shouldAnimate ? { scale: 0.98, opacity: 0 } : false}
							animate={{ scale: 1, opacity: 1 }}
							transition={shouldAnimate ? motionSpring.soft : { duration: 0 }}
						/>
					</div>
					{(filename || mediaType) && (
						<div className="flex items-center gap-2.5">
							<div className="min-w-0 flex-1 space-y-1 px-0.5">
								{filename && (
									<h4 className="truncate font-semibold text-sm leading-none">
										{filename}
									</h4>
								)}
								{mediaType && (
									<p className="truncate font-mono text-muted-foreground text-xs">
										{mediaType}
									</p>
								)}
							</div>
						</div>
					)}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
