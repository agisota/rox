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

type UnsafePiiFields = {
	email?: unknown;
	name?: unknown;
	token?: unknown;
};

export interface AppOpenedInput extends UnsafePiiFields {
	appVersion?: string;
	platform?: string;
}

export interface SignInCompletedInput extends UnsafePiiFields {
	userId: string;
	organizationId?: string | null;
}

export interface WorkspaceCreatedInput {
	workspaceId: string;
	projectId?: string | null;
	source?: string;
	wasExisting?: boolean;
	workspaceName?: unknown;
	prompt?: unknown;
}

/**
 * Maps each canonical event name to its required/optional property shape.
 * Adding an event here is the single edit needed to make it type-safe at every
 * `track`/`capture` call site.
 */
export interface AnalyticsEventMap {
	[ANALYTICS_EVENTS.APP_OPENED]: {
		app_version?: string;
		platform?: string;
	};
	[ANALYTICS_EVENTS.SIGN_IN_COMPLETED]: {
		user_id: string;
		organization_id?: string;
	};
	[ANALYTICS_EVENTS.PROJECT_CREATED]: {
		project_id: string;
		organization_id?: string;
	};
	[ANALYTICS_EVENTS.WORKSPACE_CREATED]: {
		workspace_id: string;
		project_id?: string;
		source?: string;
		was_existing?: boolean;
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

export function createAppOpenedEvent(
	input: AppOpenedInput = {},
): AnalyticsEvent<typeof ANALYTICS_EVENTS.APP_OPENED> {
	return {
		name: ANALYTICS_EVENTS.APP_OPENED,
		properties: {
			app_version: input.appVersion,
			platform: input.platform,
		},
	};
}

export function createSignInCompletedEvent(
	input: SignInCompletedInput,
): AnalyticsEvent<typeof ANALYTICS_EVENTS.SIGN_IN_COMPLETED> {
	return {
		name: ANALYTICS_EVENTS.SIGN_IN_COMPLETED,
		properties: {
			user_id: input.userId,
			organization_id: input.organizationId ?? undefined,
		},
	};
}

export function createWorkspaceCreatedEvent(
	input: WorkspaceCreatedInput,
): AnalyticsEvent<typeof ANALYTICS_EVENTS.WORKSPACE_CREATED> {
	return {
		name: ANALYTICS_EVENTS.WORKSPACE_CREATED,
		properties: {
			workspace_id: input.workspaceId,
			project_id: input.projectId ?? undefined,
			source: input.source,
			was_existing: input.wasExisting,
		},
	};
}
