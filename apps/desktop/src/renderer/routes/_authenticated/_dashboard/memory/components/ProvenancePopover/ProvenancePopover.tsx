import type { SelectMemoryItem } from "@rox/db/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { cn } from "@rox/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { HiOutlineInformationCircle } from "react-icons/hi2";
import { LuExternalLink } from "react-icons/lu";
import { provenanceInfo } from "../../lib/provenance";

interface ProvenancePopoverProps {
	item: SelectMemoryItem;
	className?: string;
}

/**
 * The "i" affordance: a popover drilling into where a memory came from
 * (`Вручную/Агент/Импорт/Промпт`) and, for agent/import items, the
 * day/conversation/import-time pulled from `sourceRef`. When the item carries a
 * `conversationId`/`sessionId`, an "Открыть сессию" deep-link navigates to the
 * journal scoped to that conversation — the surface where agent memories
 * originate — so the user can trace the memory back to its source.
 *
 * All data is derived from the resident row (no server call), so this ports to
 * web/mobile unchanged.
 */
export function ProvenancePopover({ item, className }: ProvenancePopoverProps) {
	const navigate = useNavigate();
	const info = provenanceInfo(item);

	const openSession = () => {
		if (!info.conversationId) return;
		void navigate({ to: "/journal", search: { q: info.conversationId } });
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Источник записи"
					className={cn(
						"rounded p-1 text-muted-foreground transition-colors hover:text-foreground",
						className,
					)}
				>
					<HiOutlineInformationCircle className="size-3.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 p-3 text-sm">
				<div className="mb-2 flex items-center justify-between gap-2">
					<span className="font-medium text-foreground text-xs uppercase tracking-wide">
						Источник
					</span>
					<span className="rounded bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
						{info.sourceTitle}
					</span>
				</div>

				{info.details.length > 0 ? (
					<dl className="space-y-1.5">
						{info.details.map((detail) => (
							<div
								key={detail.label}
								className="flex items-baseline justify-between gap-3"
							>
								<dt className="shrink-0 text-muted-foreground text-xs">
									{detail.label}
								</dt>
								<dd className="min-w-0 select-text truncate text-right text-foreground text-xs">
									{detail.value}
								</dd>
							</div>
						))}
					</dl>
				) : (
					<p className="text-muted-foreground text-xs">
						Запись добавлена вручную — дополнительных данных о происхождении
						нет.
					</p>
				)}

				{info.conversationId && (
					<button
						type="button"
						onClick={openSession}
						className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-muted"
					>
						<LuExternalLink className="size-3.5" />
						Открыть сессию
					</button>
				)}
			</PopoverContent>
		</Popover>
	);
}
