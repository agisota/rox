import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * Dashboard sidebar "surface" visibility preferences.
 *
 * The left dashboard sidebar exposes a set of secondary surfaces (Почта,
 * Заметки, Календарь, Drive, Входящие, Память, Журнал, Canvas). These are
 * power-user destinations that clutter the rail for most users, so they are
 * hidden by default and re-enabled per-surface from Settings → Поверхности.
 *
 * This store is the single source of truth for that visibility, shared by the
 * sidebar (which reads it to decide which nav buttons to render) and the
 * settings toggles (which write it). Prefs persist locally via the same
 * zustand `persist` middleware every other local-pref store in this app uses.
 */

/** Stable id for every toggleable sidebar surface. */
export type SurfaceId =
	| "canvas"
	| "journal"
	| "memory"
	| "inbox"
	| "drive"
	| "calendar"
	| "notes"
	| "email";

interface SurfaceDefinition {
	id: SurfaceId;
	/** RU label shown both in the sidebar and the settings toggle row. */
	label: string;
	/** Short RU hint shown under the toggle in settings. */
	hint: string;
}

/**
 * Ordered registry of the surfaces that can be hidden. Order matches the
 * sidebar's visual order so the settings list reads top-to-bottom the same way.
 */
export const TOGGLEABLE_SURFACES: readonly SurfaceDefinition[] = [
	{ id: "canvas", label: "Canvas", hint: "Холст для свободной компоновки" },
	{ id: "journal", label: "Журнал", hint: "Хронология событий и активности" },
	{ id: "memory", label: "Память", hint: "Долговременная память агентов" },
	{ id: "inbox", label: "Входящие", hint: "Уведомления и входящие запросы" },
	{ id: "drive", label: "Drive", hint: "Файловое хранилище" },
	{ id: "calendar", label: "Календарь", hint: "События и расписание" },
	{ id: "notes", label: "Заметки", hint: "Личные заметки" },
	{ id: "email", label: "Почта", hint: "Почтовый ящик" },
] as const;

/**
 * Default visibility per surface. Every toggleable surface ships hidden so the
 * rail stays focused on the primary destinations (Рабочие пространства,
 * Автоматизации, Пайплайны, Задачи, Библиотека скиллов, Сохранённые промпты),
 * which are not part of this store and are always visible.
 */
const DEFAULT_VISIBILITY: Record<SurfaceId, boolean> = {
	canvas: false,
	journal: false,
	memory: false,
	inbox: false,
	drive: false,
	calendar: false,
	notes: false,
	email: false,
};

interface SurfaceVisibilityState {
	/** Map of surfaceId → whether the surface is shown in the sidebar. */
	visibility: Record<SurfaceId, boolean>;
	/** True when the surface should render in the sidebar. */
	isVisible: (id: SurfaceId) => boolean;
	/** Set a single surface's visibility. */
	setVisible: (id: SurfaceId, visible: boolean) => void;
	/** Flip a single surface's visibility. */
	toggle: (id: SurfaceId) => void;
	/** Restore the default (all hidden) visibility. */
	reset: () => void;
}

export const useSurfaceVisibilityStore = create<SurfaceVisibilityState>()(
	devtools(
		persist(
			(set, get) => ({
				visibility: { ...DEFAULT_VISIBILITY },
				isVisible: (id) =>
					get().visibility[id] ?? DEFAULT_VISIBILITY[id] ?? false,
				setVisible: (id, visible) =>
					set((state) => ({
						visibility: { ...state.visibility, [id]: visible },
					})),
				toggle: (id) =>
					set((state) => ({
						visibility: {
							...state.visibility,
							[id]: !(state.visibility[id] ?? DEFAULT_VISIBILITY[id] ?? false),
						},
					})),
				reset: () => set({ visibility: { ...DEFAULT_VISIBILITY } }),
			}),
			{
				name: "surface-visibility-v1",
				// Merge persisted prefs over defaults so newly added surfaces pick
				// up their default visibility instead of becoming `undefined`.
				merge: (persisted, current) => {
					const persistedState = (persisted ?? {}) as Partial<
						Pick<SurfaceVisibilityState, "visibility">
					>;
					return {
						...current,
						visibility: {
							...DEFAULT_VISIBILITY,
							...(persistedState.visibility ?? {}),
						},
					};
				},
			},
		),
		{ name: "SurfaceVisibility" },
	),
);

/** Hook: subscribe to a single surface's visibility. */
export const useIsSurfaceVisible = (id: SurfaceId): boolean =>
	useSurfaceVisibilityStore((state) => state.visibility[id] ?? false);
