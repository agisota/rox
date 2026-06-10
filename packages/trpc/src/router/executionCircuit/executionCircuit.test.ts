import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as realDbSchema from "@rox/db/schema";
import { defaultCircuitForTask } from "@rox/workflow-core";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";

const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "member" },
}));
const verifyOrgMembershipWithSubscriptionMock = mock(async () => ({
	membership: { role: "member" },
	subscription: null,
}));

// Sequential result queues for the db select / insert / update chains.
let selectResults: unknown[][] = [];
let insertResults: unknown[][] = [];
let updateResults: unknown[][] = [];

function createDb() {
	const selectLimitMock = mock(async () => selectResults.shift() ?? []);
	const selectOrderByLimitMock = mock(async () => selectResults.shift() ?? []);
	const selectOrderByMock = mock(() => ({ limit: selectOrderByLimitMock }));
	const selectWhereMock = mock(() => ({
		limit: selectLimitMock,
		orderBy: selectOrderByMock,
	}));
	const selectFromMock = mock(() => ({ where: selectWhereMock }));
	const selectMock = mock(() => ({ from: selectFromMock }));

	const insertReturningMock = mock(async () => insertResults.shift() ?? []);
	const insertValuesMock = mock(() => ({ returning: insertReturningMock }));
	const insertMock = mock(() => ({ values: insertValuesMock }));

	const updateReturningMock = mock(async () => updateResults.shift() ?? []);
	const updateWhereMock = mock(() => ({ returning: updateReturningMock }));
	const updateSetMock = mock(() => ({ where: updateWhereMock }));
	const updateMock = mock(() => ({ set: updateSetMock }));

	return {
		db: {
			select: selectMock,
			insert: insertMock,
			update: updateMock,
			query: { members: { findFirst: mock(async () => undefined) } },
		},
		mocks: { selectMock, insertMock, updateMock },
	};
}

let dbState = createDb();
const dbSelectProxyMock = mock((...args: unknown[]) =>
	(dbState.db.select as (...args: unknown[]) => unknown)(...args),
);
const dbInsertProxyMock = mock((...args: unknown[]) =>
	(dbState.db.insert as (...args: unknown[]) => unknown)(...args),
);
const dbUpdateProxyMock = mock((...args: unknown[]) =>
	(dbState.db.update as (...args: unknown[]) => unknown)(...args),
);

mock.module("@rox/db/client", () => ({
	db: {
		select: dbSelectProxyMock,
		insert: dbInsertProxyMock,
		update: dbUpdateProxyMock,
		query: { members: { findFirst: mock(async () => undefined) } },
	},
	dbWs: {},
}));

mock.module("@rox/db/schema", () => ({
	...realDbSchema,
	members: {
		organizationId: "members.organizationId",
		userId: "members.userId",
	},
	tasks: {
		id: "tasks.id",
		organizationId: "tasks.organizationId",
		title: "tasks.title",
		description: "tasks.description",
		priority: "tasks.priority",
	},
	executionCircuits: {
		id: "execution_circuits.id",
		organizationId: "execution_circuits.organization_id",
		taskId: "execution_circuits.task_id",
	},
	transitionRuns: {
		id: "transition_runs.id",
		organizationId: "transition_runs.organization_id",
		executionCircuitId: "transition_runs.execution_circuit_id",
	},
	experienceTraceEvents: {
		id: "experience_trace_events.id",
		transitionRunId: "experience_trace_events.transition_run_id",
		seq: "experience_trace_events.seq",
	},
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	desc: (value: unknown) => ({ type: "desc", value }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
}));

mock.module("../integration/utils", () => ({
	verifyOrgMembership: verifyOrgMembershipMock,
	verifyOrgMembershipWithSubscription: verifyOrgMembershipWithSubscriptionMock,
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { executionCircuitRouter } = await import("./executionCircuit");

const createCaller = createCallerFactory(
	createTRPCRouter({
		executionCircuit: executionCircuitRouter,
	} satisfies TRPCRouterRecord),
);

const ACTOR_USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "55555555-5555-4555-8555-555555555555";
const CIRCUIT_ID = "66666666-6666-4666-8666-666666666666";

function createContext() {
	return {
		session: {
			user: { id: ACTOR_USER_ID, email: "actor@example.com" },
			session: { activeOrganizationId: ORGANIZATION_ID },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

const sampleSpec = defaultCircuitForTask({
	title: "Ship the thing",
	description: "Do the work",
	priority: "high",
});

describe("executionCircuit router", () => {
	beforeEach(() => {
		selectResults = [];
		insertResults = [];
		updateResults = [];
		dbState = createDb();

		verifyOrgMembershipMock.mockReset();
		verifyOrgMembershipMock.mockImplementation(async () => ({
			membership: { role: "member" },
		}));
	});

	it("rejects non-members from getByTaskId before reading circuits", async () => {
		verifyOrgMembershipMock.mockImplementationOnce(async () => {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Not a member of this organization",
			});
		});

		const caller = createCaller(createContext());

		await expect(
			caller.executionCircuit.getByTaskId({ taskId: TASK_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(dbState.mocks.selectMock).not.toHaveBeenCalled();
	});

	it("rejects an invalid spec from upsertSpec without writing", async () => {
		// getTaskForOrg resolves the task.
		selectResults.push([{ id: TASK_ID, organizationId: ORGANIZATION_ID }]);

		const badSpec = {
			...sampleSpec,
			targetState: "", // missing TargetState
		};

		const caller = createCaller(createContext());

		await expect(
			caller.executionCircuit.upsertSpec({ taskId: TASK_ID, spec: badSpec }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(dbState.mocks.insertMock).not.toHaveBeenCalled();
		expect(dbState.mocks.updateMock).not.toHaveBeenCalled();
	});

	it("compiles a deterministic transition prompt", async () => {
		// getCircuitForTask resolves the circuit holding the spec.
		selectResults.push([
			{ id: CIRCUIT_ID, organizationId: ORGANIZATION_ID, spec: sampleSpec },
		]);

		const caller = createCaller(createContext());

		const result = await caller.executionCircuit.compileTransitionPrompt({
			taskId: TASK_ID,
			transitionId: "complete",
		});

		expect(result.transitionId).toBe("complete");
		expect(result.prompt).toContain("Transition: complete (working -> done)");
		expect(result.prompt).toContain("JSON object");
	});

	it("returns null from getByTaskId when no circuit exists", async () => {
		selectResults.push([]);
		const caller = createCaller(createContext());
		const result = await caller.executionCircuit.getByTaskId({
			taskId: TASK_ID,
		});
		expect(result).toBeNull();
	});
});
