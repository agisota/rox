import type { SelectKnowledgeDocument } from "@rox/db/schema";
import type { KnowledgeDocumentType } from "@rox/shared/knowledge";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@rox/ui/empty";
import { Input } from "@rox/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { cn } from "@rox/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuNotebookText, LuPlus, LuSearch } from "react-icons/lu";
import { CreateDocumentDialog } from "./components/CreateDocumentDialog";
import { DOCUMENT_TYPES, documentTypeLabel } from "./constants";
import { useKnowledgeDocuments } from "./hooks/useKnowledgeDocuments";

export const Route = createFileRoute("/_authenticated/_dashboard/notebook/")({
	component: NotebookPage,
});

type TypeFilter = "all" | KnowledgeDocumentType;

function formatUpdatedAt(value: Date | string): string {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function NotebookPage() {
	const navigate = useNavigate();
	const [createOpen, setCreateOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

	const { data: documents = [], isLoading } = useKnowledgeDocuments({
		search,
		type: typeFilter === "all" ? undefined : typeFilter,
	});

	const showEmpty = !isLoading && documents.length === 0;

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
				<div className="flex items-center gap-3">
					<h1 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
						<LuNotebookText className="size-4" />
						Notebook
					</h1>
					<div className="h-4 w-px bg-border" />
					<Tabs
						value={typeFilter}
						onValueChange={(value) => {
							if (value) setTypeFilter(value as TypeFilter);
						}}
					>
						<TabsList className="h-8 bg-transparent p-0 gap-1">
							<TabsTrigger
								value="all"
								className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
							>
								<span className="text-sm">All</span>
							</TabsTrigger>
							{DOCUMENT_TYPES.map((option) => (
								<TabsTrigger
									key={option.value}
									value={option.value}
									className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
								>
									<span className="text-sm">{option.label}</span>
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</div>

				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-8 gap-1.5 px-3"
					onClick={() => setCreateOpen(true)}
				>
					<LuPlus className="size-4" />
					<span>New document</span>
				</Button>
			</header>

			<div className="shrink-0 border-b border-border px-4 py-2">
				<div className="relative">
					<LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search notebook…"
						className="h-8 pl-8"
					/>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{isLoading ? null : showEmpty ? (
					<Empty className="flex-1">
						<EmptyHeader>
							<EmptyMedia
								variant="icon"
								className="size-14 [&_svg:not([class*='size-'])]:size-7"
							>
								<LuNotebookText />
							</EmptyMedia>
							<EmptyTitle>
								{search.trim()
									? "No matching documents"
									: "Your notebook is empty"}
							</EmptyTitle>
							<EmptyDescription>
								{search.trim()
									? "Try a different search term."
									: "Create a note, PRD, or spec to get started."}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div className="min-h-0 flex-1 overflow-y-auto">
						{documents
							.filter((doc): doc is SelectKnowledgeDocument => doc != null)
							.map((doc) => (
								// biome-ignore lint/a11y/useSemanticElements: row needs nested interactive elements
								<div
									key={doc.id}
									role="button"
									tabIndex={0}
									onClick={() =>
										navigate({
											to: "/notebook/$slug",
											params: { slug: doc.slug },
										})
									}
									onKeyDown={(event) => {
										if (event.target !== event.currentTarget) return;
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											navigate({
												to: "/notebook/$slug",
												params: { slug: doc.slug },
											});
										}
									}}
									className={cn(
										"group/row flex h-12 min-w-0 cursor-pointer items-center gap-3 border-b border-border/50 px-4 text-sm outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
									)}
								>
									<span
										className="min-w-0 flex-1 truncate font-medium"
										title={doc.title}
									>
										{doc.title}
									</span>
									{doc.tags.length > 0 ? (
										<span className="hidden min-w-0 shrink items-center gap-1 sm:flex">
											{doc.tags.slice(0, 3).map((tag) => (
												<Badge
													key={tag}
													variant="secondary"
													className="text-[10px]"
												>
													{tag}
												</Badge>
											))}
										</span>
									) : null}
									<Badge variant="outline" className="shrink-0 text-[10px]">
										{documentTypeLabel(doc.type)}
									</Badge>
									<span className="w-24 shrink-0 truncate text-right text-xs text-muted-foreground">
										{formatUpdatedAt(doc.updatedAt)}
									</span>
								</div>
							))}
					</div>
				)}
			</div>

			<CreateDocumentDialog open={createOpen} onOpenChange={setCreateOpen} />
		</div>
	);
}
