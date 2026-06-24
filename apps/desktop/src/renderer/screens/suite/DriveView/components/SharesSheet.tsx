import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@rox/ui/sheet";
import { SharesPanel } from "./SharesPanel";

interface SharesSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** Left-docked glass sheet hosting the active public shares manager. */
export function SharesSheet({ open, onOpenChange }: SharesSheetProps) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="glass-panel flex w-[min(480px,90vw)] flex-col gap-0 border-border/60 p-0 sm:max-w-[480px]"
			>
				<SheetHeader className="gap-1 border-border/60 border-b p-4">
					<SheetTitle className="text-base">Публичные ссылки</SheetTitle>
					<SheetDescription className="text-xs">
						Активные ссылки на файлы и папки. Скопируйте или отзовите доступ.
					</SheetDescription>
				</SheetHeader>
				<div className="min-h-0 flex-1 overflow-auto p-4">
					<SharesPanel />
				</div>
			</SheetContent>
		</Sheet>
	);
}
