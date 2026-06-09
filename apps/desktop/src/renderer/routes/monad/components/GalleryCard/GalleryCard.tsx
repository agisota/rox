import type { ReactNode } from "react";

export interface GalleryCardProps {
	title: string;
	/** Optional short caption shown faint, top-right (e.g. the current state). */
	hint?: ReactNode;
	children: ReactNode;
}

/**
 * A labelled bordered cell used by every gallery section. Sits on the graphite
 * blueprint background using the MONAD `--monad-surface` token so contrast is
 * consistent across font themes and appearances.
 */
export function GalleryCard({ title, hint, children }: GalleryCardProps) {
	return (
		<div
			className="flex flex-col gap-3 p-4"
			style={{
				borderRadius: "var(--monad-radius-lg)",
				border: "1px solid var(--monad-border)",
				background: "var(--monad-surface)",
			}}
		>
			<div className="flex items-baseline justify-between gap-2">
				<span
					className="text-sm font-medium"
					style={{ color: "var(--monad-text)" }}
				>
					{title}
				</span>
				{hint != null && (
					<span
						className="text-[11px]"
						style={{ color: "var(--monad-text-faint)" }}
					>
						{hint}
					</span>
				)}
			</div>
			<div className="flex min-h-16 flex-wrap items-center gap-4">
				{children}
			</div>
		</div>
	);
}
