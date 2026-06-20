export function resolveActiveCanvasId({
	initialCanvasId,
	selectedCanvasId,
	canvasIds,
}: {
	initialCanvasId?: string | null;
	selectedCanvasId?: string | null;
	canvasIds: string[];
}): string | null {
	if (selectedCanvasId) return selectedCanvasId;
	if (initialCanvasId) return initialCanvasId;
	return canvasIds[0] ?? null;
}
