import { describe, expect, it, mock } from "bun:test";
import {
	buildMemoryContextBlock,
	injectMemoryContext,
	MEMORY_CONTEXT_MAX_CHARS,
	MEMORY_CONTEXT_MAX_ITEMS,
	MEMORY_CONTEXT_REMINDER_TYPE,
	type MemoryContextItem,
} from "./memory-context";

function item(
	overrides: Partial<MemoryContextItem> & { body: string },
): MemoryContextItem {
	return {
		category: "general",
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		...overrides,
	};
}

describe("buildMemoryContextBlock", () => {
	it("returns null for an empty list (no-op)", () => {
		expect(buildMemoryContextBlock([])).toBeNull();
	});

	it("returns null when every item body is blank", () => {
		expect(
			buildMemoryContextBlock([item({ body: "   " }), item({ body: "\n\t" })]),
		).toBeNull();
	});

	it("renders RU group headers matching the MemoryView labels", () => {
		const block = buildMemoryContextBlock([
			item({ category: "projects", body: "Строю Rox" }),
			item({ category: "identity", body: "Solo-founder" }),
			item({ category: "instructions", body: "Отвечай на русском" }),
			item({ category: "career", body: "Был инженером" }),
			item({ category: "general", body: "Всегда BLUF" }),
		]);
		expect(block).not.toBeNull();
		const text = block as string;
		expect(text).toContain("## Проекты");
		expect(text).toContain("## Личное");
		expect(text).toContain("## Предпочтения и правила");
		expect(text).toContain("## Карьера и история");
		expect(text).toContain("## Общие правила и принципы");
	});

	it("includes the delimiter and the preamble instruction", () => {
		const block = buildMemoryContextBlock([
			item({ body: "Помни про дедлайн" }),
		]) as string;
		expect(block.startsWith("<user_memory>")).toBe(true);
		expect(block.trimEnd().endsWith("</user_memory>")).toBe(true);
		expect(block).toContain("Учитывай известные факты о пользователе");
		expect(block).toContain("- Помни про дедлайн");
	});

	it("orders instructions and identity groups ahead of the rest", () => {
		const block = buildMemoryContextBlock([
			item({
				category: "general",
				body: "general-item",
				updatedAt: "2026-06-19T00:00:00.000Z",
			}),
			item({
				category: "projects",
				body: "projects-item",
				updatedAt: "2026-06-18T00:00:00.000Z",
			}),
			item({
				category: "identity",
				body: "identity-item",
				updatedAt: "2020-01-01T00:00:00.000Z",
			}),
			item({
				category: "instructions",
				body: "instructions-item",
				updatedAt: "2019-01-01T00:00:00.000Z",
			}),
		]) as string;

		const idxInstructions = block.indexOf("## Предпочтения и правила");
		const idxIdentity = block.indexOf("## Личное");
		const idxProjects = block.indexOf("## Проекты");
		const idxGeneral = block.indexOf("## Общие правила и принципы");

		// Priority groups come first even though their items are far older.
		expect(idxInstructions).toBeGreaterThanOrEqual(0);
		expect(idxIdentity).toBeGreaterThan(idxInstructions);
		expect(idxProjects).toBeGreaterThan(idxIdentity);
		expect(idxGeneral).toBeGreaterThan(idxProjects);
	});

	it("orders non-priority items most-recent-first (updatedAt desc)", () => {
		const block = buildMemoryContextBlock([
			item({
				category: "general",
				body: "older",
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
			item({
				category: "general",
				body: "newer",
				updatedAt: "2026-06-01T00:00:00.000Z",
			}),
		]) as string;
		expect(block.indexOf("- newer")).toBeLessThan(block.indexOf("- older"));
	});

	it("caps the number of injected items", () => {
		const many = Array.from({ length: MEMORY_CONTEXT_MAX_ITEMS + 10 }, (_, i) =>
			item({
				category: "general",
				body: `m${i}`,
				updatedAt: new Date(2026, 0, 1, 0, 0, i),
			}),
		);
		const block = buildMemoryContextBlock(many) as string;
		const bulletCount = (block.match(/^- /gm) ?? []).length;
		expect(bulletCount).toBe(MEMORY_CONTEXT_MAX_ITEMS);
	});

	it("caps total characters but always keeps at least one item", () => {
		const huge = "x".repeat(MEMORY_CONTEXT_MAX_CHARS + 500);
		const block = buildMemoryContextBlock([
			item({ category: "general", body: huge }),
			item({ category: "general", body: "second" }),
		]) as string;
		// The first (huge) item is kept even though it alone exceeds the budget;
		// the second is dropped because the budget is already blown.
		expect(block).toContain(huge);
		expect(block).not.toContain("- second");
	});
});

describe("injectMemoryContext", () => {
	function makeApiClient(
		items: MemoryContextItem[],
		listMock?: ReturnType<typeof mock>,
	) {
		const query = listMock ?? mock(async () => items);
		return {
			client: { memory: { list: { query } } } as never,
			query,
		};
	}

	it("injects an approved-memory system reminder into an empty thread", async () => {
		const listMessages = mock(async () => []);
		const saveSystemReminderMessage = mock(async () => ({}));
		const { client, query } = makeApiClient([
			item({ category: "instructions", body: "Отвечай кратко" }),
		]);

		await injectMemoryContext(
			{ listMessages, saveSystemReminderMessage },
			client,
		);

		expect(query).toHaveBeenCalledTimes(1);
		expect(query).toHaveBeenCalledWith({ status: "approved" });
		expect(saveSystemReminderMessage).toHaveBeenCalledTimes(1);
		const arg = saveSystemReminderMessage.mock.calls[0]?.[0] as {
			message: string;
			reminderType: string;
			role?: string;
		};
		expect(arg.reminderType).toBe(MEMORY_CONTEXT_REMINDER_TYPE);
		expect(arg.role).toBe("system");
		expect(arg.message).toContain("Отвечай кратко");
	});

	it("is a no-op when the thread already has messages", async () => {
		const listMessages = mock(async () => [{ id: "m1" }]);
		const saveSystemReminderMessage = mock(async () => ({}));
		const { client, query } = makeApiClient([
			item({ body: "should not be fetched" }),
		]);

		await injectMemoryContext(
			{ listMessages, saveSystemReminderMessage },
			client,
		);

		expect(query).not.toHaveBeenCalled();
		expect(saveSystemReminderMessage).not.toHaveBeenCalled();
	});

	it("is a no-op when the user has no approved memories", async () => {
		const listMessages = mock(async () => []);
		const saveSystemReminderMessage = mock(async () => ({}));
		const { client } = makeApiClient([]);

		await injectMemoryContext(
			{ listMessages, saveSystemReminderMessage },
			client,
		);

		expect(saveSystemReminderMessage).not.toHaveBeenCalled();
	});

	it("never throws when the memory query fails (best-effort)", async () => {
		const listMessages = mock(async () => []);
		const saveSystemReminderMessage = mock(async () => ({}));
		const query = mock(async () => {
			throw new Error("memory.list unavailable");
		});
		const client = { memory: { list: { query } } } as never;

		await expect(
			injectMemoryContext({ listMessages, saveSystemReminderMessage }, client),
		).resolves.toBeUndefined();
		expect(saveSystemReminderMessage).not.toHaveBeenCalled();
	});

	it("requests only approved items (scoping is enforced server-side)", async () => {
		const listMessages = mock(async () => []);
		const saveSystemReminderMessage = mock(async () => ({}));
		const { client, query } = makeApiClient([item({ body: "approved fact" })]);

		await injectMemoryContext(
			{ listMessages, saveSystemReminderMessage },
			client,
		);

		// The host passes no org/user — `memory.list` derives both from the
		// authenticated session, so this call cannot leak across tenants. We only
		// assert the status filter here; org/user scoping is covered server-side.
		expect(query).toHaveBeenCalledWith({ status: "approved" });
	});
});
