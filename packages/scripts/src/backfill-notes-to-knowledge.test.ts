import { describe, expect, test } from "bun:test";
import {
	type LegacyNoteRow,
	planNoteBackfill,
} from "./backfill-notes-to-knowledge";

const base: LegacyNoteRow = {
	id: "note-1",
	organizationId: "org-1",
	notebookId: "nb-1",
	ownerUserId: "user-1",
	title: "Legacy",
	markdown: "# hi",
	tags: ["a"],
	knowledgeDocumentId: null,
};

let counter = 0;
const stableSlug = () => `note-slug-${counter++}`;

describe("planNoteBackfill", () => {
	test("plans a backing doc for each unlinked legacy note", () => {
		counter = 0;
		const plan = planNoteBackfill([base], stableSlug);
		expect(plan.skipped).toBe(0);
		expect(plan.documents).toHaveLength(1);
		const doc = plan.documents[0];
		expect(doc?.noteId).toBe("note-1");
		expect(doc?.notebookId).toBe("nb-1");
		expect(doc?.organizationId).toBe("org-1");
		expect(doc?.createdByUserId).toBe("user-1");
		expect(doc?.title).toBe("Legacy");
		expect(doc?.markdown).toBe("# hi");
		expect(doc?.tags).toEqual(["a"]);
		expect(doc?.slug).toBe("note-slug-0");
	});

	test("is idempotent — already-linked notes are skipped, not re-created", () => {
		const linked: LegacyNoteRow = {
			...base,
			id: "note-2",
			knowledgeDocumentId: "doc-existing",
		};
		const plan = planNoteBackfill([base, linked], stableSlug);
		expect(plan.skipped).toBe(1);
		expect(plan.documents.map((d) => d.noteId)).toEqual(["note-1"]);
	});

	test("precondition-safe — empty input produces no work", () => {
		const plan = planNoteBackfill([], stableSlug);
		expect(plan.documents).toHaveLength(0);
		expect(plan.skipped).toBe(0);
	});

	test("defaults null markdown/tags to empty values", () => {
		const sparse: LegacyNoteRow = {
			...base,
			markdown: null,
			tags: null,
		};
		const plan = planNoteBackfill([sparse], stableSlug);
		expect(plan.documents[0]?.markdown).toBe("");
		expect(plan.documents[0]?.tags).toEqual([]);
	});

	test("mints a kebab slug that starts with note-", () => {
		const plan = planNoteBackfill([base]);
		expect(plan.documents[0]?.slug).toMatch(/^note-[a-z0-9]+$/);
	});
});
