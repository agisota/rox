import type { MemoryCategory, SelectMemoryItem } from "@rox/db/schema";
import { Input } from "@rox/ui/input";
import { toast } from "@rox/ui/sonner";
import { useState } from "react";
import { HiOutlinePlus, HiOutlineTrash } from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { DEFAULT_MEMORIES } from "../../default-memories";

interface MemoryGroupProps {
	category: MemoryCategory;
	label: string;
	hint: string;
	items: SelectMemoryItem[];
	/**
	 * Whether the memory live query has finished its first sync. Cache-first
	 * rule: only show seed examples once we know the category is genuinely empty,
	 * never during the initial loading frame (which would flash examples over
	 * rows that are about to hydrate).
	 */
	isReady: boolean;
}

/**
 * One memory category: its approved items plus a freehand input that saves a new
 * manual memory on Enter. Writes go through the Electric collection (optimistic);
 * the collection's onInsert/onDelete sync to the memory tRPC router.
 *
 * When the category is empty (and ready), it shows non-persisted seed examples;
 * each has a one-click "Добавить себе" that materializes a real row via the same
 * manual-add path. Nothing is written on mount, so deletions stick.
 */
export function MemoryGroup({
	category,
	label,
	hint,
	items,
	isReady,
}: MemoryGroupProps) {
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

	// Seed examples for an empty category: only once the query is ready (so we
	// don't flash them over rows that are still hydrating) and the user is known.
	const examples = DEFAULT_MEMORIES[category] ?? [];
	const showExamples =
		isReady &&
		items.length === 0 &&
		examples.length > 0 &&
		Boolean(userId && organizationId);

	return (
		<section className="rounded-lg border border-border p-4">
			<div className="mb-3">
				<h2 className="font-medium text-foreground text-sm">{label}</h2>
				<p className="text-muted-foreground text-xs">{hint}</p>
			</div>

			{items.length > 0 && (
				<ul className="mb-3 space-y-1.5">
					{items.map((item) => (
						<li
							key={item.id}
							className="group flex items-start gap-2 rounded-md bg-muted/40 px-2.5 py-1.5"
						>
							<span className="flex-1 text-foreground text-sm leading-snug">
								{item.body}
							</span>
							<button
								type="button"
								aria-label="Удалить"
								onClick={() => {
									const tx = collections.memoryItems.delete(item.id);
									void tx.isPersisted.promise.catch(() =>
										toast.error("Не удалось удалить — попробуйте ещё раз"),
									);
								}}
								className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
							>
								<HiOutlineTrash className="size-3.5" />
							</button>
						</li>
					))}
				</ul>
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
