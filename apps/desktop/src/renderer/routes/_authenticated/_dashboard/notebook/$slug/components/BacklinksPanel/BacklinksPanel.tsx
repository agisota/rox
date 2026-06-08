import type { KnowledgeBacklink } from "@rox/shared/knowledge";
import { cn } from "@rox/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuLink2 } from "react-icons/lu";

interface BacklinksPanelProps {
	backlinks: KnowledgeBacklink[];
}

export function BacklinksPanel({ backlinks }: BacklinksPanelProps) {
	const navigate = useNavigate();

	return (
		<aside className="flex w-64 shrink-0 flex-col border-l border-border">
			<div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				<LuLink2 className="size-3.5" />
				Backlinks
				<span className="tabular-nums text-muted-foreground/70">
					{backlinks.length}
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				{backlinks.length === 0 ? (
					<p className="px-2 py-1.5 text-xs text-muted-foreground">
						No documents link here yet.
					</p>
				) : (
					backlinks.map((backlink) => (
						<button
							key={backlink.sourceDocumentId}
							type="button"
							onClick={() =>
								navigate({
									to: "/notebook/$slug",
									params: { slug: backlink.sourceSlug },
								})
							}
							className={cn(
								"flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50",
							)}
						>
							<span className="min-w-0 truncate text-sm font-medium text-foreground">
								{backlink.sourceTitle}
							</span>
							<span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
								{backlink.sourceSlug}
							</span>
						</button>
					))
				)}
			</div>
		</aside>
	);
}
