import { describe, expect, it } from "bun:test";
import type { SelectMemoryItem } from "@rox/db/schema";
import { provenanceInfo, provenanceLabel } from "./provenance";

function mem(
	overrides: Partial<SelectMemoryItem> & { source: SelectMemoryItem["source"] },
): SelectMemoryItem {
	return {
		id: "1",
		organizationId: "org",
		createdBy: "user",
		category: "general",
		body: "body",
		status: "approved",
		sourceRef: null,
		importJobId: null,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		...overrides,
	} as SelectMemoryItem;
}

describe("provenanceLabel", () => {
	it("returns null for a plain manual item", () => {
		expect(provenanceLabel(mem({ source: "manual" }))).toBeNull();
	});

	it("includes the day for an agent item", () => {
		const label = provenanceLabel(
			mem({ source: "agent", sourceRef: { day: "2026-06-12" } }),
		);
		expect(label).toBe("от агента · 2026-06-12");
	});
});

describe("provenanceInfo", () => {
	it("titles the source and surfaces the conversation deep-link", () => {
		const info = provenanceInfo(
			mem({
				source: "agent",
				sourceRef: { day: "2026-06-12", conversationId: "conv-9" },
			}),
		);
		expect(info.sourceTitle).toBe("Агент");
		expect(info.conversationId).toBe("conv-9");
		expect(info.details).toEqual([
			{ label: "День", value: "2026-06-12" },
			{ label: "Диалог", value: "conv-9" },
		]);
	});

	it("falls back to sessionId when no conversationId", () => {
		const info = provenanceInfo(
			mem({ source: "agent", sourceRef: { sessionId: "sess-3" } }),
		);
		expect(info.conversationId).toBe("sess-3");
	});

	it("formats importedAt to a date and exposes no deep-link", () => {
		const info = provenanceInfo(
			mem({
				source: "archive",
				sourceRef: { importedAt: "2026-06-12T10:30:00.000Z" },
			}),
		);
		expect(info.sourceTitle).toBe("Импорт");
		expect(info.conversationId).toBeNull();
		expect(info.details).toEqual([
			{ label: "Импортировано", value: "2026-06-12" },
		]);
	});

	it("has no details for a bare manual item", () => {
		const info = provenanceInfo(mem({ source: "manual" }));
		expect(info.sourceTitle).toBe("Вручную");
		expect(info.details).toEqual([]);
		expect(info.conversationId).toBeNull();
	});
});
