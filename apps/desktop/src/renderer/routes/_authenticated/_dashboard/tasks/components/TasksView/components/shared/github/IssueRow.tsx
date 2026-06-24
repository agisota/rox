import { Button } from "@rox/ui/button";
import { Checkbox } from "@rox/ui/checkbox";
import { cn } from "@rox/ui/utils";
import { GoIssueClosed, GoIssueOpened } from "react-icons/go";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { LuPlus } from "react-icons/lu";
import type { IssueLabel, IssueListItem } from "./types";

interface IssueRowProps {
	issue: IssueListItem;
	selected: boolean;
	onToggleSelect: (issue: IssueListItem, checked: boolean) => void;
	onOpen: (issueNumber: number) => void;
	onOpenUrl: (url: string) => void;
	onAddToWorkspace: (issue: IssueListItem) => void;
}

/** Render a single GitHub label chip with its repo color, GitHub-style. */
function LabelChip({ label }: { label: IssueLabel }) {
	const color = label.color ? `#${label.color}` : undefined;
	return (
		<span
			className="hidden shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium @lg:inline-flex"
			style={
				color
					? {
							borderColor: `${color}66`,
							backgroundColor: `${color}1a`,
							color,
						}
					: undefined
			}
		>
			{label.name}
		</span>
	);
}

/** Dense single-line issue row (h-11), checkbox-selectable, with label chips. */
export function IssueRow({
	issue,
	selected,
	onToggleSelect,
	onOpen,
	onOpenUrl,
	onAddToWorkspace,
}: IssueRowProps) {
	const isClosed = issue.state === "closed";
	const StateIcon = isClosed ? GoIssueClosed : GoIssueOpened;

	return (
		// biome-ignore lint/a11y/useSemanticElements: row contains nested action buttons, so the outer element is a div with role/tabIndex
		<div
			className="group flex h-11 items-center gap-3 border-b border-border/50 px-4 cursor-pointer hover:bg-accent/50"
			onClick={() => onOpen(issue.issueNumber)}
			onKeyDown={(e) => {
				if (e.target !== e.currentTarget) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen(issue.issueNumber);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<Checkbox
				checked={selected}
				onCheckedChange={(checked) => onToggleSelect(issue, checked === true)}
				onClick={(e) => e.stopPropagation()}
				aria-label="Выбрать Issue"
				className="shrink-0 cursor-pointer"
			/>
			<StateIcon
				className={cn(
					"size-4 shrink-0",
					isClosed ? "text-violet-500" : "text-emerald-500",
				)}
			/>
			<span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
				#{issue.issueNumber}
			</span>
			<span className="min-w-0 flex-1 truncate text-sm font-medium">
				{issue.title}
			</span>

			{issue.labels.slice(0, 3).map((label) => (
				<LabelChip key={label.name} label={label} />
			))}

			{issue.authorLogin && (
				<span className="hidden shrink-0 text-xs text-muted-foreground @md:inline">
					{issue.authorLogin}
				</span>
			)}

			<div className="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon-xs"
					title="Открыть в браузере"
					onClick={(e) => {
						e.stopPropagation();
						onOpenUrl(issue.url);
					}}
				>
					<HiOutlineArrowTopRightOnSquare className="size-3.5" />
				</Button>
				<Button
					variant="outline"
					size="sm"
					title="В рабочее пространство"
					className="h-7 gap-1.5 px-2 text-xs"
					onClick={(e) => {
						e.stopPropagation();
						onAddToWorkspace(issue);
					}}
				>
					<LuPlus className="size-3.5" />
					<span className="hidden @xl:inline">В рабочее пространство</span>
				</Button>
			</div>
		</div>
	);
}
