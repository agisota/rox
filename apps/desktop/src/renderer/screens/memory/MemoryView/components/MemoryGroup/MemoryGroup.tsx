import type { MemoryCategory, SelectMemoryItem } from "@rox/db/schema";
import { Input } from "@rox/ui/input";
import { useState } from "react";
import { HiOutlineTrash } from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface MemoryGroupProps {
	category: MemoryCategory;
	label: string;
	hint: string;
	items: SelectMemoryItem[];
}

/**
 * One memory category: its approved items plus a freehand input that saves a new
 * manual memory on Enter. Writes go through the Electric collection (optimistic);
 * the collection's onInsert/onDelete sync to the memory tRPC router.
 */
export function MemoryGroup({
	category,
	label,
	hint,
	items,
}: MemoryGroupProps) {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const [draft, setDraft] = useState("");

	const userId = session?.user?.id ?? "";
	const organizationId = session?.session?.activeOrganizationId ?? "";

	const handleSubmit = () => {
		const body = draft.trim();
		if (!body || !userId || !organizationId) return;
		const now = new Date();
		collections.memoryItems.insert({
			id: crypto.randomUUID(),
			organizationId,
			createdBy: userId,
			category,
			body,
			source: "manual",
			status: "approved",
			sourceRef: null,
			importJobId: null,
			createdAt: now,
			updatedAt: now,
		});
		setDraft("");
	};

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
								onClick={() => collections.memoryItems.delete(item.id)}
								className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
							>
								<HiOutlineTrash className="size-3.5" />
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
