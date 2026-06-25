/**
 * Onboarding wizard core — shared, platform-neutral (F48, Hermes-borrow #637).
 *
 * The single source of truth for the onboarding wizard's *shape* and *logic*:
 * the canonical step sequence (system → setup → workspace → finish), a pure
 * navigation reducer (which step is current, can we go back / continue / skip),
 * the host capability flags that toggle platform-only affordances (desktop can
 * install dev tools; web/mobile are connect-only), and a pure `/models`
 * probe state machine (idle → probing → ok | error) whose gate drives the
 * "Continue" button.
 *
 * Why it lives in `@rox/shared` (and stays React-free, like the F56 zen-mode
 * and F44 command-palette cores): the RN mobile host **cannot** import the
 * DOM-oriented `@rox/ui` package, so the only home all three surfaces
 * (web + desktop DOM, mobile RN) can share is `@rox/shared`. Everything here is
 * plain TS — pure reducers and pure functions, no React, no DOM, no
 * react-native, no framer-motion. Each host wraps these reducers in its own
 * thin React/RN state and injects the real async probe call:
 *
 * - **Desktop** → `@rox/ui/onboarding-wizard-shell` (DOM shell) + the real
 *   `chatServiceTrpc.auth.discoverCustomProviderModels` mutation as the probe.
 * - **Web** → same DOM shell, connect-only (no desktop chat-service on web, so
 *   the probe stays idle until a server path exists).
 * - **Mobile** → RN host re-renders this same neutral state with RN primitives.
 *
 * Copy that is RU-specific and host-owned (desktop's localized titles) is
 * passed in by the host; the neutral core only carries stable ids + ordering.
 */

/** A single wizard step's neutral data. Copy is host-supplied where localized. */
export interface WizardStep {
	/** Stable identifier, used for keys and gating. Never localized. */
	id: WizardStepId;
	/** Display heading. Host-supplied (desktop copy is RU-specific). */
	title: string;
	/** Optional supporting line under the heading. */
	subtitle?: string;
	/**
	 * When true the step can be skipped without satisfying its gate. All
	 * onboarding steps are non-blocking today (Skip is always available), but
	 * the flag keeps the contract explicit for hosts that want to require one.
	 */
	optional?: boolean;
}

/** The canonical onboarding steps, in order. Ids are stable + platform-neutral. */
export type WizardStepId = "system" | "setup" | "workspace" | "finish";

/**
 * The canonical onboarding step sequence as DATA. Titles/subtitles are left
 * empty here on purpose: the desktop flow carries RU-specific copy and supplies
 * it per step, so the neutral core only fixes the *ids and their order*. Hosts
 * spread this and merge their localized copy (see {@link withStepCopy}).
 */
export const ONBOARDING_STEP_SEQUENCE: readonly WizardStepId[] = [
	"system",
	"setup",
	"workspace",
	"finish",
] as const;

/**
 * Build a concrete {@link WizardStep} list from host-supplied copy keyed by id.
 * Steps absent from `copy` fall back to their id as the title so a host can
 * render a partial flow without crashing. Order always follows
 * {@link ONBOARDING_STEP_SEQUENCE}.
 */
export function withStepCopy(
	copy: Partial<
		Record<
			WizardStepId,
			{ title: string; subtitle?: string; optional?: boolean }
		>
	>,
): WizardStep[] {
	return ONBOARDING_STEP_SEQUENCE.map((id) => {
		const entry = copy[id];
		return {
			id,
			title: entry?.title ?? id,
			subtitle: entry?.subtitle,
			optional: entry?.optional,
		};
	});
}

/**
 * Host capability flags. They toggle platform-only affordances so the *same*
 * step renders connect-only on web/mobile and full (with the Electron dep
 * installer) on desktop.
 */
export interface WizardCapabilities {
	/**
	 * Whether the host can install local dev tools (git / gh) in-app. Desktop
	 * (Electron) passes `true`; web and mobile pass `false`, hiding the install
	 * affordance in favour of connect-only copy.
	 */
	canInstallDeps: boolean;
}

/** Connect-only capabilities — web + mobile. */
export const CONNECT_ONLY_CAPABILITIES: WizardCapabilities = {
	canInstallDeps: false,
};

/** Full desktop capabilities — Electron can install dev tools. */
export const DESKTOP_CAPABILITIES: WizardCapabilities = {
	canInstallDeps: true,
};

// ---------------------------------------------------------------------------
// Navigation reducer
// ---------------------------------------------------------------------------

/** Immutable navigation state over a fixed-length step list. */
export interface WizardNavState {
	/** Zero-based index of the active step. */
	currentIndex: number;
	/** Total number of steps. */
	stepCount: number;
}

/** Navigation actions the reducer understands. */
export type WizardNavAction =
	| { type: "next" }
	| { type: "back" }
	| { type: "goTo"; index: number };

/** Create the initial nav state for a `stepCount`-length wizard. */
export function createWizardNavState(
	stepCount: number,
	startIndex = 0,
): WizardNavState {
	return {
		stepCount: Math.max(0, stepCount),
		currentIndex: clampIndex(startIndex, stepCount),
	};
}

/** Pure reducer: advances/rewinds/jumps within the step bounds. */
export function wizardNavReducer(
	state: WizardNavState,
	action: WizardNavAction,
): WizardNavState {
	switch (action.type) {
		case "next":
			return moveTo(state, state.currentIndex + 1);
		case "back":
			return moveTo(state, state.currentIndex - 1);
		case "goTo":
			return moveTo(state, action.index);
		default:
			return state;
	}
}

/** Whether a Back action would move (i.e. not already on the first step). */
export function canGoBack(state: WizardNavState): boolean {
	return state.currentIndex > 0;
}

/**
 * Whether a Continue action may proceed. `gateSatisfied` is the step-specific
 * gate (e.g. probe status === "ok"); a step with no gate passes `true`. The
 * final step never "continues" — the host finalizes there instead.
 */
export function canContinue(
	state: WizardNavState,
	gateSatisfied = true,
): boolean {
	const isLast = state.currentIndex >= state.stepCount - 1;
	return !isLast && gateSatisfied;
}

function moveTo(state: WizardNavState, index: number): WizardNavState {
	const next = clampIndex(index, state.stepCount);
	if (next === state.currentIndex) return state;
	return { ...state, currentIndex: next };
}

function clampIndex(index: number, stepCount: number): number {
	if (stepCount <= 0) return 0;
	return Math.min(Math.max(0, index), stepCount - 1);
}

// ---------------------------------------------------------------------------
// `/models` probe state machine
// ---------------------------------------------------------------------------

/** Status of a `/models` probe against an OpenAI-compatible base URL. */
export type ProbeStatus = "idle" | "probing" | "ok" | "error";

/** Immutable probe state. `models` is populated on `ok`; `error` on failure. */
export interface ProbeState {
	status: ProbeStatus;
	/** Discovered model ids; present (possibly empty) once status is "ok". */
	models?: string[];
	/** Human-readable failure reason; present once status is "error". */
	error?: string;
}

/** The idle starting state. */
export const PROBE_IDLE: ProbeState = { status: "idle" };

/** Probe lifecycle actions. */
export type ProbeAction =
	| { type: "start" }
	| { type: "success"; models: string[] }
	| { type: "failure"; error: string }
	| { type: "reset" };

/** Pure reducer for the probe state machine. */
export function probeReducer(
	state: ProbeState,
	action: ProbeAction,
): ProbeState {
	switch (action.type) {
		case "start":
			return { status: "probing" };
		case "success":
			return { status: "ok", models: action.models };
		case "failure":
			return { status: "error", error: action.error };
		case "reset":
			return PROBE_IDLE;
		default:
			return state;
	}
}

/**
 * The "Continue" gate for the probe step: progression is allowed only once the
 * probe has succeeded. `idle` and `error` block Continue (but hosts keep Skip
 * available, matching the non-blocking skip philosophy).
 */
export function probeGateSatisfied(state: ProbeState): boolean {
	return state.status === "ok";
}
