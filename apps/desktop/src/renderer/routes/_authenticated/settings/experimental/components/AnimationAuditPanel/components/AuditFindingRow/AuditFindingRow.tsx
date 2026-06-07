import { motion } from "framer-motion";
import { listItemVariants } from "renderer/motion";

export interface Finding {
	id: string;
	label: string;
	status: "pass" | "warn" | "fail";
	costMs: number;
}

const STATUS_CONFIG: Record<
	Finding["status"],
	{ label: string; className: string }
> = {
	pass: { label: "Pass", className: "text-emerald-500" },
	warn: { label: "Warn", className: "text-amber-500" },
	fail: { label: "Fail", className: "text-destructive" },
};

export interface AuditFindingRowProps {
	finding: Finding;
}

export function AuditFindingRow({ finding }: AuditFindingRowProps) {
	const { label, status, costMs } = finding;
	const { label: statusLabel, className: statusClass } = STATUS_CONFIG[status];

	return (
		<motion.div
			layout
			variants={listItemVariants}
			className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm"
		>
			<span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
			<span className={`shrink-0 font-medium ${statusClass}`}>
				{statusLabel}
			</span>
			<span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
				{costMs.toFixed(1)} ms
			</span>
		</motion.div>
	);
}
