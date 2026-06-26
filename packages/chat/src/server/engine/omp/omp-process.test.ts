import { describe, expect, it } from "bun:test";
import { OmpProcess } from "./omp-process";

/**
 * Frame-shaping tests for {@link OmpProcess}. These pin the exact JSONL frames
 * the transport writes to omp's stdin against the verified `omp/15.11.0 --mode
 * rpc` contract — in particular the FLAT `extension_ui_response` shape (the
 * answer field at the top level, never nested under `value`) and the session
 * commands (`new_session`/`switch_session`/`branch`/`get_branch_messages`).
 *
 * The transport writes through `this.child.stdin.write`, so the tests install a
 * fake child that captures every written frame and (for request commands)
 * synthesizes the correlated `{type:"response"}` so the promise resolves.
 */

interface CapturedFrame {
	[key: string]: unknown;
	type?: string;
	id?: string;
}

/** Install a fake child on an OmpProcess and capture all written frames. */
function withFakeChild(autoRespond: boolean): {
	omp: OmpProcess;
	frames: CapturedFrame[];
} {
	const frames: CapturedFrame[] = [];
	const omp = new OmpProcess({ model: "anthropic/claude-haiku-4-5" });

	const fakeChild = {
		killed: false,
		stdin: {
			write(line: string) {
				const frame = JSON.parse(line.trim()) as CapturedFrame;
				frames.push(frame);
				// For correlated request() frames, feed back a success response so the
				// awaiting promise resolves. Echo a tiny data payload per command.
				if (autoRespond && frame.id && frame.type) {
					const data = synthesizeResponseData(frame);
					// biome-ignore lint/suspicious/noExplicitAny: reach into private router
					(omp as any).handleResponse({
						id: frame.id,
						type: "response",
						command: frame.type,
						success: true,
						data,
					});
				}
				return true;
			},
		},
		kill() {
			this.killed = true;
		},
	};

	// biome-ignore lint/suspicious/noExplicitAny: install the fake child + ready flag
	const internal = omp as any;
	internal.child = fakeChild;
	internal.ready = true;
	internal.exited = false;
	return { omp, frames };
}

function synthesizeResponseData(frame: CapturedFrame): unknown {
	switch (frame.type) {
		case "new_session":
			return { cancelled: false };
		case "switch_session":
			return { cancelled: false };
		case "branch":
			return { text: "edited text", cancelled: false };
		case "get_branch_messages":
			return {
				messages: [
					{ entryId: "71079705", text: "ONE" },
					{ entryId: "b533054e", text: "TWO" },
				],
			};
		case "get_state":
			return { sessionFile: "/tmp/s/abc.jsonl", isStreaming: false };
		default:
			return {};
	}
}

describe("OmpProcess.respondToExtensionUi (flat frame shape)", () => {
	it("writes {id, value} for a string answer (input/select)", () => {
		const { omp, frames } = withFakeChild(false);
		omp.respondToExtensionUi("ui-1", "Ada Lovelace");
		expect(frames).toEqual([
			{ type: "extension_ui_response", id: "ui-1", value: "Ada Lovelace" },
		]);
	});

	it("spreads {confirmed} at the top level (confirm) — never nested", () => {
		const { omp, frames } = withFakeChild(false);
		omp.respondToExtensionUi("ui-2", { confirmed: true });
		expect(frames).toEqual([
			{ type: "extension_ui_response", id: "ui-2", confirmed: true },
		]);
		// Guard against the old nested-under-value regression.
		expect(frames[0]).not.toHaveProperty("value");
	});

	it("spreads {value} from an object answer at the top level (input)", () => {
		const { omp, frames } = withFakeChild(false);
		omp.respondToExtensionUi("ui-3", { value: "typed answer" });
		expect(frames[0]).toEqual({
			type: "extension_ui_response",
			id: "ui-3",
			value: "typed answer",
		});
	});
});

describe("OmpProcess session commands", () => {
	it("new_session writes {type:new_session} and reads cancelled", async () => {
		const { omp, frames } = withFakeChild(true);
		const result = await omp.newSession();
		expect(frames[0]?.type).toBe("new_session");
		expect(result).toEqual({ cancelled: false });
	});

	it("switch_session writes the sessionPath", async () => {
		const { omp, frames } = withFakeChild(true);
		const result = await omp.switchSession("/tmp/s/abc.jsonl");
		expect(frames[0]).toMatchObject({
			type: "switch_session",
			sessionPath: "/tmp/s/abc.jsonl",
		});
		expect(result).toEqual({ cancelled: false });
	});

	it("branch writes the entryId and returns the branched text", async () => {
		const { omp, frames } = withFakeChild(true);
		const result = await omp.branch("71079705");
		expect(frames[0]).toMatchObject({ type: "branch", entryId: "71079705" });
		expect(result).toEqual({ text: "edited text", cancelled: false });
	});

	it("getBranchMessages returns the {entryId, text} entries", async () => {
		const { omp } = withFakeChild(true);
		const entries = await omp.getBranchMessages();
		expect(entries).toEqual([
			{ entryId: "71079705", text: "ONE" },
			{ entryId: "b533054e", text: "TWO" },
		]);
	});
});
