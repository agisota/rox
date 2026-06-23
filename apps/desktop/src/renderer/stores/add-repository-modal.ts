import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface NewProjectResult {
	projectId: string;
	/** main-workspace of the created project; null if it could not be created. */
	mainWorkspaceId: string | null;
}

/**
 * What the caller wants after a successful create.
 *  - "open": the modal wiring should navigate into the main-workspace.
 *  - "return-id": no navigation; caller uses projectId itself (e.g. the
 *    ProjectPickerPill selecting the project inside the new-workspace form).
 */
export type NewProjectIntent = "open" | "return-id";

type ActiveModal =
	| { kind: "none" }
	| { kind: "new-project"; intent: NewProjectIntent }
	| { kind: "template-gallery"; intent: NewProjectIntent };

interface AddRepositoryModalState {
	active: ActiveModal;
	/**
	 * Opens the modal and resolves with the created project (or `null` if the
	 * user closed it). Only one open call can be in flight at a time — calling
	 * again while a previous open is pending resolves the prior promise to
	 * `null` before opening fresh. Safe today because there is only one global
	 * `NewProjectModal` instance.
	 */
	openNewProject: (opts?: {
		intent?: NewProjectIntent;
	}) => Promise<NewProjectResult | null>;
	openTemplateGallery: (opts?: {
		intent?: NewProjectIntent;
	}) => Promise<NewProjectResult | null>;
	resolveNewProject: (result: NewProjectResult | null) => void;
	close: () => void;
}

// Module-level resolver so callbacks aren't stored in zustand state. The store
// drives the modal's open/close UI; the resolver bridges the imperative open()
// call back to its caller.
let pendingResolve: ((result: NewProjectResult | null) => void) | null = null;

export const useAddRepositoryModalStore = create<AddRepositoryModalState>()(
	devtools(
		(set) => ({
			active: { kind: "none" },
			openNewProject: ({ intent = "return-id" } = {}) => {
				pendingResolve?.(null);
				return new Promise<NewProjectResult | null>((resolve) => {
					pendingResolve = resolve;
					set({ active: { kind: "new-project", intent } });
				});
			},
			openTemplateGallery: ({ intent = "return-id" } = {}) => {
				pendingResolve?.(null);
				return new Promise<NewProjectResult | null>((resolve) => {
					pendingResolve = resolve;
					set({ active: { kind: "template-gallery", intent } });
				});
			},
			resolveNewProject: (result) => {
				const resolve = pendingResolve;
				pendingResolve = null;
				set({ active: { kind: "none" } });
				resolve?.(result);
			},
			close: () => {
				const resolve = pendingResolve;
				pendingResolve = null;
				set({ active: { kind: "none" } });
				resolve?.(null);
			},
		}),
		{ name: "add-repository-modal" },
	),
);

export const useAddRepositoryModalActive = () =>
	useAddRepositoryModalStore((state) => state.active);
export const useOpenNewProjectModal = () =>
	useAddRepositoryModalStore((state) => state.openNewProject);
export const useOpenTemplateGalleryModal = () =>
	useAddRepositoryModalStore((state) => state.openTemplateGallery);
export const useResolveNewProjectModal = () =>
	useAddRepositoryModalStore((state) => state.resolveNewProject);
export const useCloseAddRepositoryModal = () =>
	useAddRepositoryModalStore((state) => state.close);
