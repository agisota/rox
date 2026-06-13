import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@rox/ui/breadcrumb";
import { Button } from "@rox/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { LuClock, LuPause, LuPlay, LuTrash2 } from "react-icons/lu";

interface AutomationDetailHeaderProps {
	name: string;
	enabled: boolean;
	onBack: () => void;
	onToggleEnabled: () => void;
	onDelete: () => void;
	onRunNow: () => void;
	onOpenHistory: () => void;
	toggleDisabled?: boolean;
	deleteDisabled?: boolean;
	runNowDisabled?: boolean;
}

export function AutomationDetailHeader({
	name,
	enabled,
	onBack,
	onToggleEnabled,
	onDelete,
	onRunNow,
	onOpenHistory,
	toggleDisabled,
	deleteDisabled,
	runNowDisabled,
}: AutomationDetailHeaderProps) {
	return (
		<header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
			<Breadcrumb>
				<BreadcrumbList className="text-sm">
					<BreadcrumbItem>
						<BreadcrumbLink onClick={onBack} className="cursor-pointer">
							Автоматизации
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage className="font-medium">{name}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onOpenHistory}
							aria-label="История версий"
						>
							<LuClock className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>История версий</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onToggleEnabled}
							disabled={toggleDisabled}
							aria-label={enabled ? "Приостановить" : "Возобновить"}
						>
							{enabled ? (
								<LuPause className="size-4" />
							) : (
								<LuPlay className="size-4" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{enabled ? "Приостановить" : "Возобновить"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onDelete}
							disabled={deleteDisabled}
							aria-label="Удалить"
						>
							<LuTrash2 className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Удалить</TooltipContent>
				</Tooltip>
				<div className="mx-1 h-4 w-px bg-border" />
				<Button
					variant="outline"
					size="sm"
					className="h-8 gap-1.5 px-3"
					onClick={onRunNow}
					disabled={runNowDisabled}
				>
					<LuPlay className="size-4" />
					<span>Запустить сейчас</span>
				</Button>
			</div>
		</header>
	);
}
