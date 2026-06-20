export interface CanvasSelectionState {
	nodeIds: string[];
	edgeIds: string[];
	groupIds: string[];
}

export interface CanvasCapabilitySelectionInput {
	nodeIds?: string[];
	edgeIds?: string[];
	groupIds?: string[];
}

export const emptyCanvasSelection = (): CanvasSelectionState => ({
	nodeIds: [],
	edgeIds: [],
	groupIds: [],
});

export function getCanvasSelectionCount(
	selection: CanvasSelectionState,
): number {
	return (
		selection.nodeIds.length +
		selection.edgeIds.length +
		selection.groupIds.length
	);
}

export function hasCanvasSelection(selection: CanvasSelectionState): boolean {
	return getCanvasSelectionCount(selection) > 0;
}

export function toCanvasCapabilitySelectionInput(
	selection: CanvasSelectionState,
): CanvasCapabilitySelectionInput | undefined {
	const input: CanvasCapabilitySelectionInput = {};
	if (selection.nodeIds.length > 0) input.nodeIds = selection.nodeIds;
	if (selection.edgeIds.length > 0) input.edgeIds = selection.edgeIds;
	if (selection.groupIds.length > 0) input.groupIds = selection.groupIds;
	return Object.keys(input).length > 0 ? input : undefined;
}

export function getCanvasCapabilityDisabledReason({
	hasActiveCanvas,
	isPending,
	requiresSelection,
	selection,
}: {
	hasActiveCanvas: boolean;
	isPending: boolean;
	requiresSelection: boolean;
	selection: CanvasSelectionState;
}): string | undefined {
	if (!hasActiveCanvas) {
		return "Open a persisted Canvas before running capabilities.";
	}
	if (isPending) {
		return "A Canvas capability is already running.";
	}
	if (requiresSelection && !hasCanvasSelection(selection)) {
		return "Select one or more Canvas entities before running this capability.";
	}
	return undefined;
}
