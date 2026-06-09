import { Button } from "@rox/ui/button";
import { useState } from "react";
import {
	AnimatedHeight,
	AnimatedNumber,
	MotionList,
	Pressable,
	StatusPulse,
	type StatusPulseStatus,
} from "renderer/monad";
import { GalleryCard } from "../GalleryCard";

const PULSE_STATUSES: StatusPulseStatus[] = [
	"idle",
	"transition",
	"verified",
	"warn",
	"error",
];

/** The PR-00 motion helpers underneath the primitives. */
export function FoundationSection() {
	const [count, setCount] = useState(128);
	const [open, setOpen] = useState(true);
	const [rows, setRows] = useState(["alpha", "beta", "gamma"]);

	return (
		<section className="mb-10">
			<h2
				className="mb-4 text-xs uppercase tracking-[0.18em]"
				style={{ color: "var(--monad-text-muted)" }}
			>
				Motion foundation
			</h2>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				<GalleryCard title="AnimatedNumber" hint="spring count">
					<span className="text-2xl" style={{ color: "var(--monad-text)" }}>
						<AnimatedNumber value={count} />
					</span>
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => setCount((c) => c + 17)}
						>
							+17
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setCount((c) => c - 5)}
						>
							−5
						</Button>
					</div>
				</GalleryCard>

				<GalleryCard title="StatusPulse" hint="halo per status">
					<div className="flex items-center gap-4">
						{PULSE_STATUSES.map((status) => (
							<StatusPulse key={status} status={status} />
						))}
					</div>
				</GalleryCard>

				<GalleryCard title="Pressable" hint="press scale">
					<Pressable
						style={{
							borderRadius: "var(--monad-radius-lg)",
							border: "1px solid var(--monad-border)",
							background: "var(--monad-surface-raised)",
							color: "var(--monad-text)",
							padding: "8px 14px",
							fontSize: 13,
						}}
					>
						press me
					</Pressable>
				</GalleryCard>

				<GalleryCard title="AnimatedHeight" hint={open ? "open" : "collapsed"}>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setOpen((v) => !v)}
					>
						{open ? "collapse" : "expand"}
					</Button>
					<AnimatedHeight open={open}>
						<div
							className="mt-2 max-w-xs text-xs"
							style={{ color: "var(--monad-text-muted)" }}
						>
							Height animates from 0 → content. The content stays mounted; only
							the wrapper height transitions.
						</div>
					</AnimatedHeight>
				</GalleryCard>

				<GalleryCard title="MotionList" hint={`${rows.length} rows`}>
					<MotionList className="flex flex-col gap-1">
						{rows.map((row) => (
							<div
								key={row}
								className="text-xs"
								style={{ color: "var(--monad-text)" }}
							>
								{row}
							</div>
						))}
					</MotionList>
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => setRows((r) => [...r, `row-${r.length + 1}`])}
						>
							add
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setRows((r) => r.slice(0, -1))}
						>
							remove
						</Button>
					</div>
				</GalleryCard>
			</div>
		</section>
	);
}
