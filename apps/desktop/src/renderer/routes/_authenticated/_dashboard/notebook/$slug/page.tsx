import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@rox/ui/alert-dialog";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@rox/ui/empty";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuArrowLeft, LuFileQuestion, LuTrash2 } from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { documentTypeLabel } from "../constants";
import { BacklinksPanel } from "./components/BacklinksPanel";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/notebook/$slug/",
)({
	component: NotebookDocumentPage,
});

function NotebookDocumentPage() {
	const { slug } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [confirmDelete, setConfirmDelete] = useState(false);

	const documentQuery = useQuery({
		queryKey: ["knowledge", "document", slug],
		queryFn: () => apiTrpcClient.knowledge.get.query({ slug }),
		retry: false,
	});

	const backlinksQuery = useQuery({
		queryKey: ["knowledge", "backlinks", slug],
		queryFn: () => apiTrpcClient.knowledge.backlinks.query({ slug }),
		retry: false,
	});

	const document = documentQuery.data;

	const deleteMutation = useMutation({
		mutationFn: (id: string) => apiTrpcClient.knowledge.delete.mutate({ id }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["knowledge"] });
			toast.success("Document deleted");
			navigate({ to: "/notebook" });
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to delete document",
			),
	});

	if (documentQuery.isLoading) {
		return (
			<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
				<header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
					<Skeleton className="h-4 w-40" />
				</header>
				<div className="flex-1 space-y-3 p-6">
					<Skeleton className="h-6 w-1/3" />
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</div>
		);
	}

	if (documentQuery.isError || !document) {
		return (
			<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
				<header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-8 gap-1.5"
						onClick={() => navigate({ to: "/notebook" })}
					>
						<LuArrowLeft className="size-4" />
						Notebook
					</Button>
				</header>
				<Empty className="flex-1">
					<EmptyHeader>
						<EmptyMedia
							variant="icon"
							className="size-14 [&_svg:not([class*='size-'])]:size-7"
						>
							<LuFileQuestion />
						</EmptyMedia>
						<EmptyTitle>Document not found</EmptyTitle>
						<EmptyDescription>
							No notebook document exists at <code>{slug}</code>.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
				<div className="flex min-w-0 items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Back to notebook"
						onClick={() => navigate({ to: "/notebook" })}
					>
						<LuArrowLeft className="size-4" />
					</Button>
					<h1 className="min-w-0 truncate text-sm font-semibold tracking-tight">
						{document.title}
					</h1>
					<Badge variant="outline" className="shrink-0 text-[10px]">
						{documentTypeLabel(document.type)}
					</Badge>
				</div>

				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-8 gap-1.5 text-muted-foreground"
					onClick={() => setConfirmDelete(true)}
				>
					<LuTrash2 className="size-4" />
					Delete
				</Button>
			</header>

			<div className="flex min-h-0 flex-1 overflow-hidden">
				<div className="min-w-0 flex-1 overflow-hidden">
					{document.markdown?.trim() ? (
						<MarkdownRenderer
							content={document.markdown}
							className="px-6 py-4"
						/>
					) : (
						<div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
							This document has no content yet.
						</div>
					)}
				</div>
				<BacklinksPanel backlinks={backlinksQuery.data ?? []} />
			</div>

			<AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete document?</AlertDialogTitle>
						<AlertDialogDescription>
							"{document.title}" will be permanently removed from your notebook.
							This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleteMutation.isPending}
							onClick={() => deleteMutation.mutate(document.id)}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
