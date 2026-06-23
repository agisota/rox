import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { HostServiceAvailabilityStatus } from "renderer/lib/host-service-unavailable";

const startMutateMock = mock(
	(
		_input: { organizationId: string },
		_opts?: { onError?: (error: unknown) => void },
	) => undefined,
);
const toastErrorMock = mock((_message: string) => undefined);

let hostState: {
	activeHostUrl: string | null;
	activeOrganizationId: string | null;
	hostServiceStatus: HostServiceAvailabilityStatus;
} = {
	activeHostUrl: null,
	activeOrganizationId: "org-1",
	hostServiceStatus: "stopped",
};
let mutationPending = false;

mock.module("react", () => ({
	useCallback: <T extends (...args: never[]) => unknown>(callback: T) =>
		callback,
}));

mock.module("@rox/ui/sonner", () => ({
	toast: { error: toastErrorMock },
}));

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		hostServiceCoordinator: {
			start: {
				useMutation: () => ({
					mutate: startMutateMock,
					isPending: mutationPending,
				}),
			},
		},
	},
}));

mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => hostState,
	}),
);

const { useHostReadiness } = await import("./useHostReadiness");

describe("useHostReadiness", () => {
	beforeEach(() => {
		startMutateMock.mockClear();
		toastErrorMock.mockClear();
		mutationPending = false;
		hostState = {
			activeHostUrl: null,
			activeOrganizationId: "org-1",
			hostServiceStatus: "stopped",
		};
	});

	it("is not ready and not connecting while no host url exists", () => {
		const readiness = useHostReadiness();
		expect(readiness.hostReady).toBe(false);
		expect(readiness.status).toBe("stopped");
		expect(readiness.connecting).toBe(false);
	});

	it("is ready once a host url is present", () => {
		hostState.activeHostUrl = "http://127.0.0.1:51000";
		hostState.hostServiceStatus = "running";
		const readiness = useHostReadiness();
		expect(readiness.hostReady).toBe(true);
		expect(readiness.status).toBe("running");
	});

	it("reflects a pending mutation through connecting", () => {
		mutationPending = true;
		const readiness = useHostReadiness();
		expect(readiness.connecting).toBe(true);
	});

	it("connect starts the coordinator for the active organization", () => {
		const readiness = useHostReadiness();
		readiness.connect();
		expect(startMutateMock).toHaveBeenCalledTimes(1);
		expect(startMutateMock.mock.calls[0]?.[0]).toEqual({
			organizationId: "org-1",
		});
	});

	it("connect surfaces a toast and skips the mutation without an active org", () => {
		hostState.activeOrganizationId = null;
		const readiness = useHostReadiness();
		readiness.connect();
		expect(startMutateMock).not.toHaveBeenCalled();
		expect(toastErrorMock).toHaveBeenCalledTimes(1);
	});

	it("connect surfaces the error message when the start mutation fails", () => {
		const readiness = useHostReadiness();
		readiness.connect();
		const opts = startMutateMock.mock.calls[0]?.[1];
		opts?.onError?.(new Error("boom"));
		expect(toastErrorMock).toHaveBeenCalledWith("boom");
	});
});
