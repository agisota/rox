import { describe, expect, test } from "bun:test";
import { parseArchiveExport } from "./archive-parse";

describe("parseArchiveExport — chatgpt", () => {
	test("flattens mapping nodes into an ordered transcript", () => {
		const json = JSON.stringify([
			{
				title: "Про Rox",
				mapping: {
					n2: {
						message: {
							author: { role: "assistant" },
							content: { parts: ["Привет!"] },
							create_time: 2,
						},
					},
					n1: {
						message: {
							author: { role: "user" },
							content: { parts: ["Как дела?"] },
							create_time: 1,
						},
					},
				},
			},
		]);
		expect(parseArchiveExport("chatgpt", json)).toEqual([
			{ title: "Про Rox", text: "Пользователь: Как дела?\nАссистент: Привет!" },
		]);
	});

	test("skips empty conversations + defaults title", () => {
		const json = JSON.stringify([{ mapping: {} }]);
		expect(parseArchiveExport("chatgpt", json)).toEqual([]);
	});
});

describe("parseArchiveExport — anthropic", () => {
	test("flattens chat_messages", () => {
		const json = JSON.stringify([
			{
				name: "Беседа",
				chat_messages: [
					{ sender: "human", text: "Запомни X" },
					{ sender: "assistant", text: "Запомнил" },
				],
			},
		]);
		expect(parseArchiveExport("anthropic", json)).toEqual([
			{ title: "Беседа", text: "Пользователь: Запомни X\nАссистент: Запомнил" },
		]);
	});
});

describe("parseArchiveExport — defensive", () => {
	test("returns [] on invalid JSON", () => {
		expect(parseArchiveExport("chatgpt", "not json")).toEqual([]);
	});
	test("returns [] on non-array root", () => {
		expect(parseArchiveExport("anthropic", '{"foo":1}')).toEqual([]);
	});
});
