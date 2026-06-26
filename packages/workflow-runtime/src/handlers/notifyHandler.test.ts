import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "../executor/types";
import {
	makeNotifyHandler,
	type NotifyPort,
	type NotifyRequest,
	type NotifyResult,
} from "./notifyHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "n1",
		block: { type: "notify", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

/** Records every call so tests can assert the port was (or was not) invoked. */
function recordingPort(result: NotifyResult): {
	port: NotifyPort;
	calls: NotifyRequest[];
} {
	const calls: NotifyRequest[] = [];
	const port: NotifyPort = async (req) => {
		calls.push(req);
		return result;
	};
	return { port, calls };
}

describe("makeNotifyHandler", () => {
	test("delivers via the mock channel port and chains the input through", async () => {
		const { port, calls } = recordingPort({ delivered: true, ref: "42" });
		const handler = makeNotifyHandler(port);
		const res = await handler(
			ctx(
				{ channel: "telegram", message: "Hello {{name}}", target: "123" },
				{ name: "Mark", priority: "high" },
			),
		);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toEqual({
			channel: "telegram",
			message: "Hello Mark",
			target: "123",
		});
		expect(res.handle).toBe("out");
		expect(res.output).toEqual({
			name: "Mark",
			priority: "high",
			notify: { channel: "telegram", delivered: true, ref: "42" },
		});
	});

	test("missing channel routes to error without calling the port", async () => {
		const { port, calls } = recordingPort({ delivered: true });
		const res = await makeNotifyHandler(port)(ctx({ message: "hi" }));
		expect(calls).toHaveLength(0);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("NOTIFY_CHANNEL_MISSING");
	});

	test("missing message routes to error", async () => {
		const { port } = recordingPort({ delivered: true });
		const res = await makeNotifyHandler(port)(ctx({ channel: "slack" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("NOTIFY_MESSAGE_MISSING");
	});

	test("a thrown port maps to the error handle", async () => {
		const port: NotifyPort = async () => {
			throw new Error("channel not configured");
		};
		const res = await makeNotifyHandler(port)(
			ctx({ channel: "slack", message: "x" }),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("NOTIFY_DELIVERY_FAILED");
		expect(res.error?.message).toContain("channel not configured");
	});

	test("a not-delivered result routes to error", async () => {
		const { port } = recordingPort({ delivered: false });
		const res = await makeNotifyHandler(port)(
			ctx({ channel: "telegram", message: "x", target: "1" }),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("NOTIFY_NOT_DELIVERED");
	});
});
