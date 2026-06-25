import { EmptyState, type EmptyStateChip } from "@rox/ui/empty-state";
import { FolderPlus, Sparkles, UploadCloud } from "lucide-react";
import { useMemo } from "react";
import { useEmptyStateSuggestions } from "renderer/hooks/useEmptyStateSuggestions";

interface DriveEmptyStateProps {
	/** Root has no parent — copy differs slightly from an empty subfolder. */
	isRoot: boolean;
	/** Active workspace name, to tint the seeded copy (F21/F25). */
	workspaceName?: string | null;
	onUpload: () => void;
	onCreateFolder: () => void;
}

/**
 * Drive empty state, now on the shared `@rox/ui` `EmptyState` primitive (F57,
 * #650). The static upload/create actions stay first as concrete CTAs; any
 * AI-seeded starters from `suggestions.forSurface` (e.g. «навести порядок») are
 * appended as extra chips. Dispatch tokens from the endpoint (`upload`,
 * `create-folder`) map back onto the local handlers; free-text starters are
 * advisory and currently route to the create/upload affordance.
 */
export function DriveEmptyState({
	isRoot,
	workspaceName,
	onUpload,
	onCreateFolder,
}: DriveEmptyStateProps) {
	const { suggestions, isLoading } = useEmptyStateSuggestions({
		surface: "drive",
		workspaceName,
	});

	const chips = useMemo<EmptyStateChip[]>(() => {
		const base: EmptyStateChip[] = [
			{
				id: "drive-upload",
				label: "Загрузить",
				icon: <UploadCloud />,
				onSelect: onUpload,
			},
			{
				id: "drive-folder",
				label: "Папка",
				icon: <FolderPlus />,
				onSelect: onCreateFolder,
			},
		];
		for (const s of suggestions) {
			if (s.prompt === "upload" || s.prompt === "create-folder") continue;
			base.push({
				id: s.id,
				label: s.label,
				icon: <Sparkles />,
				onSelect: onCreateFolder,
			});
		}
		return base;
	}, [suggestions, onUpload, onCreateFolder]);

	return (
		<EmptyState
			className="border-dashed"
			icon={<UploadCloud />}
			title={isRoot ? "Здесь пока пусто" : "Папка пуста"}
			description={
				isRoot
					? "Перетащите файлы сюда или нажмите «Загрузить»."
					: "Перетащите файлы или создайте подпапку."
			}
			chips={chips}
			chipsLoading={isLoading}
		/>
	);
}
