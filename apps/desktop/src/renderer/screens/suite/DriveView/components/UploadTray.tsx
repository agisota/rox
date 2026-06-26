import { Button } from "@rox/ui/button";
import { AnimatedPresence, MotionList, MotionListItem } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { CheckCircle2, RotateCcw, UploadCloud, X, XCircle } from "lucide-react";
import type { UploadItem } from "../hooks/useDriveUpload";

interface UploadTrayProps {
	items: UploadItem[];
	onRetry: (id: string) => void;
	onDismiss: (id: string) => void;
	onClear: () => void;
}

/** Determinate SVG progress ring (0..1) for an in-flight upload. */
function ProgressRing({ fraction }: { fraction: number }) {
	const r = 8;
	const c = 2 * Math.PI * r;
	const offset = c * (1 - Math.max(0, Math.min(1, fraction)));
	return (
		<svg
			width={22}
			height={22}
			viewBox="0 0 22 22"
			className="shrink-0"
			role="img"
			aria-label={`Загрузка ${Math.round(fraction * 100)}%`}
		>
			<circle
				cx={11}
				cy={11}
				r={r}
				fill="none"
				strokeWidth={2.5}
				className="stroke-muted-foreground/25"
			/>
			<circle
				cx={11}
				cy={11}
				r={r}
				fill="none"
				strokeWidth={2.5}
				strokeLinecap="round"
				strokeDasharray={c}
				strokeDashoffset={offset}
				transform="rotate(-90 11 11)"
				className="stroke-primary transition-[stroke-dashoffset] duration-150"
			/>
		</svg>
	);
}

function UploadRow({
	item,
	onRetry,
	onDismiss,
}: {
	item: UploadItem;
	onRetry: (id: string) => void;
	onDismiss: (id: string) => void;
}) {
	return (
		<div className="flex items-center gap-2.5 px-3 py-2">
			{item.status === "uploading" ? (
				<ProgressRing fraction={item.progress} />
			) : item.status === "done" ? (
				<CheckCircle2 className="size-[18px] shrink-0 text-emerald-500" />
			) : (
				<XCircle className="size-[18px] shrink-0 text-destructive" />
			)}

			<div className="min-w-0 flex-1">
				<p className="truncate text-foreground text-xs" title={item.name}>
					{item.name}
				</p>
				<p className="truncate text-[11px] text-muted-foreground">
					{item.status === "uploading"
						? `${Math.round(item.progress * 100)}%`
						: item.status === "done"
							? item.dedup
								? "уже в хранилище"
								: "загружено"
							: (item.error ?? "ошибка")}
				</p>
			</div>

			{item.status === "error" ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-7"
					aria-label="Повторить загрузку"
					onClick={() => onRetry(item.id)}
				>
					<RotateCcw className="size-3.5" />
				</Button>
			) : null}
			{item.status !== "uploading" ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-7"
					aria-label="Убрать из списка"
					onClick={() => onDismiss(item.id)}
				>
					<X className="size-3.5" />
				</Button>
			) : null}
		</div>
	);
}

/**
 * Bottom-right docked tray showing per-file upload progress, dedup, success and
 * error states with retry + dismiss, and a header «Очистить» when nothing is in
 * flight. Animated in/out so it does not pop. Hidden entirely when empty.
 */
export function UploadTray({
	items,
	onRetry,
	onDismiss,
	onClear,
}: UploadTrayProps) {
	const active = items.filter((item) => item.status === "uploading").length;
	const idle = active === 0;

	return (
		<AnimatedPresence>
			{items.length > 0 ? (
				<div
					className={cn(
						"glass-panel pointer-events-auto fixed right-5 bottom-5 z-40 w-80",
						"overflow-hidden rounded-xl border border-border/60 shadow-xl",
					)}
				>
					<div className="flex items-center gap-2 border-border/60 border-b px-3 py-2">
						<UploadCloud className="size-4 text-primary" />
						<span className="flex-1 font-medium text-foreground text-xs">
							{active > 0
								? `Загрузка — ${active}`
								: `Загружено — ${items.length}`}
						</span>
						{idle ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-6 px-2 text-xs"
								onClick={onClear}
							>
								Очистить
							</Button>
						) : null}
					</div>
					<MotionList className="max-h-72 divide-y divide-border/40 overflow-y-auto">
						{items.map((item) => (
							<MotionListItem key={item.id}>
								<UploadRow
									item={item}
									onRetry={onRetry}
									onDismiss={onDismiss}
								/>
							</MotionListItem>
						))}
					</MotionList>
				</div>
			) : null}
		</AnimatedPresence>
	);
}
