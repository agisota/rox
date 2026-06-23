import { describe, expect, it } from "bun:test";
import type { TunnelResponse } from "../types";
import { forwardResponse, shouldStream } from "./stream-response";

describe("shouldStream", () => {
	it("streams Server-Sent Events", () => {
		expect(
			shouldStream(new Headers({ "content-type": "text/event-stream" })),
		).toBe(true);
	});

	it("streams chunked transfer encoding", () => {
		expect(shouldStream(new Headers({ "transfer-encoding": "chunked" }))).toBe(
			true,
		);
	});

	it("streams responses with no content-length", () => {
		expect(
			shouldStream(new Headers({ "content-type": "application/json" })),
		).toBe(true);
	});

	it("buffers responses with a declared content-length", () => {
		expect(
			shouldStream(
				new Headers({
					"content-type": "application/json",
					"content-length": "11",
				}),
			),
		).toBe(false);
	});
});

function fakeResponse(opts: {
	status: number;
	headers: Record<string, string>;
	chunks?: string[];
	text?: string;
}) {
	const encoder = new TextEncoder();
	const body =
		opts.chunks !== undefined
			? new ReadableStream<Uint8Array>({
					start(controller) {
						for (const chunk of opts.chunks ?? []) {
							controller.enqueue(encoder.encode(chunk));
						}
						controller.close();
					},
				})
			: null;
	return {
		status: opts.status,
		headers: new Headers(opts.headers),
		body,
		text: async () => opts.text ?? "",
	};
}

describe("forwardResponse", () => {
	it("emits a single buffered http:response for content-length responses", async () => {
		const sent: TunnelResponse[] = [];
		await forwardResponse(
			"req-1",
			fakeResponse({
				status: 200,
				headers: { "content-type": "application/json", "content-length": "11" },
				text: '{"ok":true}',
			}),
			(m) => sent.push(m),
		);
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			type: "http:response",
			id: "req-1",
			status: 200,
			body: '{"ok":true}',
		});
	});

	it("emits head + chunk* + end frames for a streaming response", async () => {
		const sent: TunnelResponse[] = [];
		await forwardResponse(
			"req-2",
			fakeResponse({
				status: 200,
				headers: { "content-type": "text/event-stream" },
				chunks: ["data: a\n\n", "data: b\n\n"],
			}),
			(m) => sent.push(m),
		);

		expect(sent[0]).toMatchObject({
			type: "http:response:head",
			id: "req-2",
			status: 200,
		});
		const chunks = sent.filter((m) => m.type === "http:response:chunk");
		expect(chunks).toHaveLength(2);
		// Chunks are base64-encoded over the wire; decode to verify payload.
		const decoded = chunks
			.map((m) =>
				Buffer.from((m as { data: string }).data, "base64").toString(),
			)
			.join("");
		expect(decoded).toBe("data: a\n\ndata: b\n\n");
		expect(sent[sent.length - 1]).toMatchObject({
			type: "http:response:end",
			id: "req-2",
		});
		expect(sent[sent.length - 1]).not.toHaveProperty("error");
	});

	it("emits an end frame with error when the body read fails mid-stream", async () => {
		const sent: TunnelResponse[] = [];
		const failingBody = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("partial"));
			},
			pull() {
				throw new Error("upstream reset");
			},
		});
		await forwardResponse(
			"req-3",
			{
				status: 200,
				headers: new Headers({ "content-type": "text/event-stream" }),
				body: failingBody,
				text: async () => "",
			},
			(m) => sent.push(m),
		);

		const end = sent[sent.length - 1] as { type: string; error?: string };
		expect(end.type).toBe("http:response:end");
		expect(end.error).toContain("upstream reset");
	});
});
