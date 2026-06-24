import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { motionSpring, useShouldAnimate } from "@rox/ui/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { motion } from "framer-motion";
import {
	LuCopy,
	LuEllipsisVertical,
	LuMessageSquarePlus,
	LuPencil,
	LuStar,
	LuTrash2,
	LuVariable,
} from "react-icons/lu";
import type { PromptEntry } from "../../lib/types";

export interface PromptCardProps {
	prompt: PromptEntry;
	onInsert: (prompt: PromptEntry) => void;
	onCopy: (prompt: PromptEntry) => void;
	onEdit: (prompt: PromptEntry) => void;
	onDelete: (prompt: PromptEntry) => void;
	onDuplicate: (prompt: PromptEntry) => void;
	onToggleFavorite: (prompt: PromptEntry) => void;
}

export function PromptCard({
	prompt,
	onInsert,
	onCopy,
	onEdit,
	onDelete,
	onDuplicate,
	onToggleFavorite,
}: PromptCardProps) {
	const animate = useShouldAnimate("essential");
	const variableCount = prompt.variableNames.length;

	return (
		<div
			className={cn(
				"group flex flex-col gap-2 rounded-lg border border-border bg-card p-4",
				"transition-[border-color,box-shadow] hover:border-border/80 hover:shadow-sm",
				"focus-within:border-border/80",
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<FavoriteStar
						active={prompt.favorite}
						animate={animate}
						onToggle={() => onToggleFavorite(prompt)}
					/>
					<h3 className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-foreground">
						{prompt.title}
					</h3>
				</div>

				<div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
					<IconAction
						label="Вставить"
						icon={LuMessageSquarePlus}
						onClick={() => onInsert(prompt)}
					/>
					<IconAction
						label="Копировать"
						icon={LuCopy}
						onClick={() => onCopy(prompt)}
					/>
					<IconAction
						label="Редактировать"
						icon={LuPencil}
						onClick={() => onEdit(prompt)}
					/>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								size="icon"
								variant="ghost"
								aria-label="Ещё"
								className="size-7"
							>
								<LuEllipsisVertical className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => onDuplicate(prompt)}>
								Дублировать
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								onClick={() => onDelete(prompt)}
							>
								<LuTrash2 className="size-4" />
								Удалить
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground select-text">
				{prompt.body}
			</p>

			{(prompt.tags.length > 0 || variableCount > 0) && (
				<div className="flex flex-wrap items-center gap-1.5">
					{variableCount > 0 && (
						<Badge variant="secondary" className="gap-1 font-mono">
							<LuVariable className="size-3" />
							{variableCount}
						</Badge>
					)}
					{prompt.tags.map((tag) => (
						<Badge key={tag} variant="outline" className="font-normal">
							{tag}
						</Badge>
					))}
				</div>
			)}
		</div>
	);
}

function IconAction({
	label,
	icon: Icon,
	onClick,
}: {
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					size="icon"
					variant="ghost"
					aria-label={label}
					onClick={onClick}
					className="size-7"
				>
					<Icon className="size-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function FavoriteStar({
	active,
	animate,
	onToggle,
}: {
	active: boolean;
	animate: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-pressed={active}
			aria-label={active ? "Убрать из избранного" : "В избранное"}
			className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
		>
			<motion.span
				className="block"
				initial={false}
				animate={animate ? { scale: active ? [1, 1.35, 1] : 1 } : undefined}
				transition={motionSpring.pop}
			>
				<LuStar
					className={cn("size-4", active && "fill-primary text-primary")}
				/>
			</motion.span>
		</button>
	);
}
