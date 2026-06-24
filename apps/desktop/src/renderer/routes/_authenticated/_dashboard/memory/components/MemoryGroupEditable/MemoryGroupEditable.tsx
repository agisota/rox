import type { MemoryCategory, SelectMemoryItem } from "@rox/db/schema";
import { Input } from "@rox/ui/input";
import { MotionList, MotionListItem } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { DEFAULT_MEMORIES } from "renderer/screens/memory/MemoryView/default-memories";
import { MemoryRow } from "../MemoryRow";

interface MemoryGroupEditableProps {
	category: MemoryCategory;
	label: string;
	hint: string;
	items: SelectMemoryItem[];
	/**
	 * Whether the live query has finished its first sync. Cache-first rule: only
	 * show seed examples once the category is genuinely empty, never during the
	 * initial loading frame (which would flash examples over hydrating rows).
	 */
	isReady: boolean;
	/** Id to pulse once after a command-palette jump. */
	flashId?: string | null;
}

/**
 * One memory category for the default (non-search) view. Same contract as the
 * shared screens/memory MemoryGroup — approved items, seed examples for an empty
 * category, and a freehand input that adds a manual memory on Enter — but each
 * approved row is a full MemoryRow, so edit-in-place / move / delete work here
 * too (the shared MemoryGroup only supported delete).
 */
export function MemoryGroupEditable({
	category,
	label,
	hint,
	items,
	isReady,
	flashId,
}: MemoryGroupEditableProps) {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const [draft, setDraft] = useState("");

	const userId = session?.user?.id ?? "";
	const organizationId = session?.session?.activeOrganizationId ?? "";

	const insertMemory = (body: string) => {
		const trimmed = body.trim();
		if (!trimmed || !userId || !organizationId) return;
		const now = new Date();
		const tx = collections.memoryItems.insert({
			id: crypto.randomUUID(),
			organizationId,
			createdBy: userId,
			category,
			body: trimmed,
			source: "manual",
			status: "approved",
			sourceRef: null,
			importJobId: null,
			createdAt: now,
			updatedAt: now,
		});
		void tx.isPersisted.promise.catch(() =>
			toast.error("Не удалось сохранить — попробуйте ещё раз"),
		);
	};

	const handleSubmit = () => {
		insertMemory(draft);
		setDraft("");
	};

	const examples = DEFAULT_MEMORIES[category] ?? [];
	const showExamples =
		isReady &&
		items.length === 0 &&
		examples.length > 0 &&
		Boolean(userId && organizationId);

	return (
		<section className="rounded-lg border border-border p-4">
			<div className="mb-3 flex items-baseline justify-between gap-2">
				<div className="min-w-0">
					<h2 className="font-medium text-foreground text-sm">{label}</h2>
					<p className="text-muted-foreground text-xs">{hint}</p>
				</div>
				{items.length > 0 && (
					<span className="shrink-0 text-muted-foreground/70 text-xs tabular-nums">
						{items.length}
					</span>
				)}
			</div>

			{items.length > 0 && (
				<MotionList className="mb-3 space-y-1.5">
					{items.map((item) => (
						<MotionListItem key={item.id}>
							<MemoryRow item={item} flash={flashId === item.id} />
						</MotionListItem>
					))}
				</MotionList>
			)}

			{showExamples && (
				<ul className="mb-3 space-y-1.5">
					{examples.map((body) => (
						<li
							key={body}
							className="group flex items-start gap-2 rounded-md border border-border border-dashed px-2.5 py-1.5"
						>
							<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
								пример
							</span>
							<span className="flex-1 text-muted-foreground text-sm leading-snug">
								{body}
							</span>
							<button
								type="button"
								aria-label="Добавить себе"
								onClick={() => insertMemory(body)}
								className="flex shrink-0 items-center gap-1 rounded text-muted-foreground text-xs opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
							>
								<HiOutlinePlus className="size-3.5" />
								Добавить себе
							</button>
						</li>
					))}
				</ul>
			)}

			<Input
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						handleSubmit();
					}
				}}
				placeholder={`Добавить в «${label}»… (Enter)`}
				className="h-8 text-sm"
			/>
		</section>
	);
}
