import { cn } from "@rox/ui/utils";
import { LuRefreshCw } from "react-icons/lu";

/**
 * Segmented PR/Issue state filter — replaces the lone "Показать закрытые"
 * checkbox with an explicit Linear-shaped segment row. Maps directly to the
 * host `includeClosed` flag (open = false, the rest = true) plus a client-side
 * post-filter on normalized state, so it needs no backend change.
 *
 * The "На ревью" segment from the spec is intentionally NOT shipped here: it
 * requires `reviewDecision` from the host `searchPullRequests` JSON, which the
 * current procedure does not return. Added as a backend follow-up
 * (see surface summary → needsShared) rather than faked.
 */

export type PrStateFilter = "open" | "merged" | "closed";
export type IssueStateFilter = "open" | "closed";

interface SegmentDef<T extends string> {
	value: T;
	label: string;
}

const PR_SEGMENTS: SegmentDef<PrStateFilter>[] = [
	{ value: "open", label: "Открытые" },
	{ value: "merged", label: "Влитые" },
	{ value: "closed", label: "Закрытые" },
];

const ISSUE_SEGMENTS: SegmentDef<IssueStateFilter>[] = [
	{ value: "open", label: "Открытые" },
	{ value: "closed", label: "Закрытые" },
];

interface StateFilterBarBaseProps {
	/** Right-aligned "N из M" count label (or "Загрузка…"). */
	countLabel: string;
	isFetching: boolean;
	onRefresh: () => void;
}

interface PrFilterBarProps extends StateFilterBarBaseProps {
	kind: "pr";
	value: PrStateFilter;
	onChange: (value: PrStateFilter) => void;
}

interface IssueFilterBarProps extends StateFilterBarBaseProps {
	kind: "issue";
	value: IssueStateFilter;
	onChange: (value: IssueStateFilter) => void;
}

type StateFilterBarProps = PrFilterBarProps | IssueFilterBarProps;

export function StateFilterBar(props: StateFilterBarProps) {
	const { countLabel, isFetching, onRefresh } = props;
	const segments = (
		props.kind === "pr" ? PR_SEGMENTS : ISSUE_SEGMENTS
	) as SegmentDef<string>[];

	return (
		<div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/60 shrink-0">
			<div className="flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5">
				{segments.map((seg) => {
					const active = seg.value === props.value;
					return (
						<button
							key={seg.value}
							type="button"
							onClick={() => {
								// Narrowed by `kind`; the value type matches the handler.
								if (props.kind === "pr") {
									props.onChange(seg.value as PrStateFilter);
								} else {
									props.onChange(seg.value as IssueStateFilter);
								}
							}}
							className={cn(
								"rounded px-2.5 py-1 text-xs font-medium transition-colors",
								active
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
							aria-pressed={active}
						>
							{seg.label}
						</button>
					);
				})}
			</div>

			<span className="ml-auto text-xs text-muted-foreground tabular-nums font-mono">
				{countLabel}
			</span>
			<button
				type="button"
				title="Обновить"
				disabled={isFetching}
				onClick={onRefresh}
				className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
			>
				<LuRefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
			</button>
		</div>
	);
}
