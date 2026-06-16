/**
 * User-path coverage map (openpanel epic, #35).
 *
 * A living, type-checked map of the product journey to the canonical analytics
 * events that mark each stage — plus an explicit list of *known gaps* (journey
 * steps that have no event yet). It answers "which key moments are we measuring,
 * and what are we missing?" without drifting into a stale doc:
 *
 * - `USER_PATH_COVERAGE` references events from the catalog, so the companion
 *   test fails if a renamed/removed event leaves a dangling reference.
 * - `findUncoveredEvents()` flags catalog events not attached to any stage, so a
 *   newly added event can't silently fall outside the journey map.
 * - `KNOWN_COVERAGE_GAPS` records journey steps the catalog can't yet express
 *   (no event exists), turning "what's missing" into an actionable list.
 */

import {
	ANALYTICS_EVENTS,
	type AnalyticsEventName,
} from "@rox/shared/constants";

/** One stage of the product journey and the events that mark progress through it. */
export interface UserPathStage {
	id: string;
	label: string;
	/** Canonical events emitted as the user moves through this stage. */
	events: readonly AnalyticsEventName[];
}

/** A journey step that is not yet measurable because no catalog event covers it. */
export interface CoverageGap {
	/** The journey stage the missing event belongs to. */
	stage: string;
	/** What is unmeasured and the event that would close the gap. */
	description: string;
}

/**
 * The product journey, ordered acquisition → monetization. Every canonical event
 * is attached to exactly one stage (enforced by the test via
 * {@link findUncoveredEvents}).
 */
export const USER_PATH_COVERAGE: readonly UserPathStage[] = [
	{
		id: "activation",
		label: "Activation — first project, workspace, and connected repo",
		events: [
			ANALYTICS_EVENTS.PROJECT_CREATED,
			ANALYTICS_EVENTS.WORKSPACE_CREATED,
			ANALYTICS_EVENTS.REPO_CONNECTED,
		],
	},
	{
		id: "core-usage",
		label: "Core usage — prompting and agent runs",
		events: [
			ANALYTICS_EVENTS.PROMPT_SUBMITTED,
			ANALYTICS_EVENTS.AGENT_RUN_STARTED,
			ANALYTICS_EVENTS.AGENT_RUN_COMPLETED,
			ANALYTICS_EVENTS.AGENT_RUN_FAILED,
		],
	},
	{
		id: "automation",
		label: "Automation — workflows and generated artifacts",
		events: [
			ANALYTICS_EVENTS.WORKFLOW_STARTED,
			ANALYTICS_EVENTS.WORKFLOW_COMPLETED,
			ANALYTICS_EVENTS.WORKFLOW_FAILED,
			ANALYTICS_EVENTS.ARTIFACT_GENERATED,
			ANALYTICS_EVENTS.PRD_GENERATED,
		],
	},
	{
		id: "monetization",
		label: "Monetization — payments",
		events: [
			ANALYTICS_EVENTS.PAYMENT_STARTED,
			ANALYTICS_EVENTS.PAYMENT_SUCCEEDED,
			ANALYTICS_EVENTS.PAYMENT_FAILED,
		],
	},
];

/**
 * Journey moments with no catalog event yet — the actionable "what's missing"
 * audit. Closing a gap means adding the named event to `ANALYTICS_EVENTS` and a
 * stage above.
 */
export const KNOWN_COVERAGE_GAPS: readonly CoverageGap[] = [
	{
		stage: "acquisition",
		description:
			"No event marks signup / account creation — only first-touch UTM traits are attached on identify. Add an `account_created` event.",
	},
	{
		stage: "acquisition",
		description:
			"No `signed_in` event for returning-user logins, so login frequency is invisible.",
	},
	{
		stage: "activation",
		description:
			"No `onboarding_completed` event to mark the end of first-run setup, so activation drop-off can't be measured.",
	},
	{
		stage: "retention",
		description:
			"No retention/engagement events (e.g. `session_started`, `feature_used`) to model returning usage over time.",
	},
];

/** All events referenced by the journey map, in stage order. */
export function coveredEvents(): AnalyticsEventName[] {
	return USER_PATH_COVERAGE.flatMap((stage) => [...stage.events]);
}

/** Catalog events not attached to any journey stage (should be empty). */
export function findUncoveredEvents(): AnalyticsEventName[] {
	const covered = new Set(coveredEvents());
	return (Object.values(ANALYTICS_EVENTS) as AnalyticsEventName[]).filter(
		(event) => !covered.has(event),
	);
}
