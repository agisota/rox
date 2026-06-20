/**
 * NDJSON framing/parsing tests.
 *
 * Covers the pure wire-protocol helpers extracted from the terminal host
 * client: incremental newline-delimited JSON parsing (including partial-frame
 * buffering across chunks) and outgoing message serialization.
 */

import { describe, expect, test } from "bun:test";
import { NdjsonParser, serializeMessage } from "./ndjson";

describe("NdjsonParser", () => {
	test("frames a single complete message", () => {
		const parser = new NdjsonParser();
		const messages = parser.parse('{"id":"a","ok":true,"payload":1}\n');
		expect(messages).toEqual([{ id: "a", ok: true, payload: 1 }]);
	});

	test("frames multiple messages in one chunk", () => {
		const parser = new NdjsonParser();
		const messages = parser.parse(
			'{"id":"a","ok":true,"payload":1}\n{"id":"b","ok":true,"payload":2}\n',
		);
		expect(messages).toEqual([
			{ id: "a", ok: true, payload: 1 },
			{ id: "b", ok: true, payload: 2 },
		]);
	});

	test("buffers a partial frame across chunks", () => {
		const parser = new NdjsonParser();

		// First chunk contains an incomplete line (no trailing newline).
		const first = parser.parse('{"id":"a","ok":true,');
		expect(first).toEqual([]);

		// Second chunk completes the line.
		const second = parser.parse('"payload":1}\n');
		expect(second).toEqual([{ id: "a", ok: true, payload: 1 }]);
	});

	test("splits a message whose newline arrives in a later chunk", () => {
		const parser = new NdjsonParser();

		// Complete JSON but newline not yet received → still buffered.
		expect(parser.parse('{"id":"a","ok":true,"payload":1}')).toEqual([]);

		// Newline plus the start of the next message.
		const messages = parser.parse('\n{"id":"b","ok":true,"payload":2}\n');
		expect(messages).toEqual([
			{ id: "a", ok: true, payload: 1 },
			{ id: "b", ok: true, payload: 2 },
		]);
	});

	test("ignores empty and whitespace-only lines", () => {
		const parser = new NdjsonParser();
		const messages = parser.parse(
			'\n   \n{"id":"a","ok":true,"payload":1}\n\n',
		);
		expect(messages).toEqual([{ id: "a", ok: true, payload: 1 }]);
	});

	test("skips malformed JSON lines without throwing and keeps valid ones", () => {
		const parser = new NdjsonParser();
		const messages = parser.parse(
			'not-json\n{"id":"a","ok":true,"payload":1}\n',
		);
		// Malformed line is dropped; the valid following line is still parsed.
		expect(messages).toEqual([{ id: "a", ok: true, payload: 1 }]);
	});

	test("retains a trailing partial frame and resumes on the next call", () => {
		const parser = new NdjsonParser();

		const first = parser.parse(
			'{"id":"a","ok":true,"payload":1}\n{"id":"b","ok":tru',
		);
		expect(first).toEqual([{ id: "a", ok: true, payload: 1 }]);

		const second = parser.parse('e,"payload":2}\n');
		expect(second).toEqual([{ id: "b", ok: true, payload: 2 }]);
	});
});

describe("serializeMessage", () => {
	test("serializes a message to a single newline-terminated JSON line", () => {
		expect(
			serializeMessage({ id: "a", type: "write", payload: { x: 1 } }),
		).toBe('{"id":"a","type":"write","payload":{"x":1}}\n');
	});

	test("round-trips serialize -> parse through NdjsonParser", () => {
		const parser = new NdjsonParser();
		const original = {
			id: "req_1",
			ok: true as const,
			payload: { foo: "bar" },
		};

		const messages = parser.parse(serializeMessage(original));

		expect(messages).toEqual([original]);
	});

	test("round-trips multiple serialized messages concatenated", () => {
		const parser = new NdjsonParser();
		const a = { id: "a", ok: true as const, payload: 1 };
		const b = { id: "b", ok: true as const, payload: 2 };

		const stream = serializeMessage(a) + serializeMessage(b);
		const messages = parser.parse(stream);

		expect(messages).toEqual([a, b]);
	});
});
