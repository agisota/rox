/**
 * Canonical, strongly-typed analytics event catalog (openpanel epic).
 *
 * Every product event in Rox flows through this catalog so the PostHog and
 * OpenPanel emitters share one source of truth for names and payload shapes.
 * Event *names* are mirrored as plain strings in
 * `@rox/shared/constants` (`ANALYTICS_EVENTS`) for non-typed call sites.
 */

import {
	ANALYTICS_EVENTS,
	type AnalyticsEventName,
} from "@rox/shared/constants";

export { ANALYTICS_EVENTS };
export type { AnalyticsEventName };

/** Primitive property values OpenPanel/PostHog accept on an event. */
export type AnalyticsPropertyValue =
	| string
	| number
	| boolean
	| null
	| undefined;

export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

interface RunProps extends AnalyticsProperties {
	run_id: string;
	agent_type?: string;
	model?: string;
}

interface RunResultProps extends RunProps {
	duration_ms?: number;
	status?: string;
	tokens?: number;
	cost_usd?: number;
}

interface WorkflowProps extends AnalyticsProperties {
	workflow_id: string;
	run_id?: string;
}

interface PaymentProps extends AnalyticsProperties {
	amount_usd?: number;
	currency?: string;
	plan?: string;
	external_id?: string;
}

/**
 * Maps each canonical event name to its required/optional property shape.
 * Adding an event here is the single edit needed to make it type-safe at every
 * `track`/`capture` call site.
 */
export interface AnalyticsEventMap {
	[ANALYTICS_EVENTS.PROJECT_CREATED]: {
		project_id: string;
		organization_id?: string;
	};
	[ANALYTICS_EVENTS.WORKSPACE_CREATED]: {
		workspace_id: string;
		project_id?: string;
	};
	[ANALYTICS_EVENTS.REPO_CONNECTED]: {
		repository_id: string;
		provider?: string;
	};
	[ANALYTICS_EVENTS.PROMPT_SUBMITTED]: {
		chat_session_id?: string;
		model?: string;
	};
	[ANALYTICS_EVENTS.AGENT_RUN_STARTED]: RunProps;
	[ANALYTICS_EVENTS.AGENT_RUN_COMPLETED]: RunResultProps;
	[ANALYTICS_EVENTS.AGENT_RUN_FAILED]: RunResultProps & { error?: string };
	[ANALYTICS_EVENTS.WORKFLOW_STARTED]: WorkflowProps;
	[ANALYTICS_EVENTS.WORKFLOW_COMPLETED]: WorkflowProps & {
		duration_ms?: number;
	};
	[ANALYTICS_EVENTS.WORKFLOW_FAILED]: WorkflowProps & { error?: string };
	[ANALYTICS_EVENTS.ARTIFACT_GENERATED]: {
		artifact_id: string;
		run_id?: string;
		kind?: string;
	};
	[ANALYTICS_EVENTS.PRD_GENERATED]: { project_id?: string };
	[ANALYTICS_EVENTS.PAYMENT_STARTED]: PaymentProps;
	[ANALYTICS_EVENTS.PAYMENT_SUCCEEDED]: PaymentProps;
	[ANALYTICS_EVENTS.PAYMENT_FAILED]: PaymentProps & { error?: string };
	[ANALYTICS_EVENTS.ACCOUNT_CREATED]: {
		organization_id?: string;
		utm_source?: string;
		utm_medium?: string;
		utm_campaign?: string;
	};
	[ANALYTICS_EVENTS.SIGNED_IN]: { method?: string };
	[ANALYTICS_EVENTS.ONBOARDING_COMPLETED]: { project_id?: string };
	[ANALYTICS_EVENTS.SESSION_STARTED]: { app?: string };
}

/** Properties allowed on a given canonical event (catalog payload + free extras). */
export type EventProperties<E extends AnalyticsEventName> =
	E extends keyof AnalyticsEventMap
		? AnalyticsEventMap[E] & AnalyticsProperties
		: AnalyticsProperties;

/** A fully-formed, named analytics event ready to emit. */
export interface AnalyticsEvent<
	E extends AnalyticsEventName = AnalyticsEventName,
> {
	name: E;
	properties?: EventProperties<E>;
}

/** Type guard: is the given string one of our canonical event names? */
export function isAnalyticsEventName(
	value: string,
): value is AnalyticsEventName {
	return (Object.values(ANALYTICS_EVENTS) as string[]).includes(value);
}
