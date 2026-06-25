import { workspaceTrpc } from "@rox/workspace-client";
import { FileText, Loader2 } from "lucide-react";

interface ArtifactsPanelProps {
	workspaceId: string;
	/** Open an artifact (canvas) by id — wired by the host when available. */
	onSelectArtifact?: (canvasId: string) => void;
}

/**
 * Artifacts tab body (F30): lists the workspace's canvas documents — the
 * project's existing artifact data, surfaced through `canvas.list`. No new
 * storage; the count badge in the tablist comes from the same query.
 */
export function ArtifactsPanel({
	workspaceId,
	onSelectArtifact,
}: ArtifactsPanelProps) {
	const query = workspaceTrpc.canvas.list.useQuery(
		{ workspaceId },
		{ enabled: !!workspaceId },
	);

	if (query.isLoading) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="size-3.5 animate-spin" />
				<span>Загрузка артефактов...</span>
			</div>
		);
	}

	const artifacts = query.data ?? [];
	if (artifacts.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-sm text-muted-foreground">
				<FileText className="size-5 opacity-60" />
				<span>Артефактов пока нет</span>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1">
			{artifacts.map((artifact) => (
				<button
					key={artifact.id}
					type="button"
					onClick={() => onSelectArtifact?.(artifact.id)}
					className="flex items-center gap-2 px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-tertiary/20 hover:text-foreground"
				>
					<FileText className="size-3.5 shrink-0 opacity-70" />
					<span className="truncate">{artifact.title}</span>
				</button>
			))}
		</div>
	);
}
