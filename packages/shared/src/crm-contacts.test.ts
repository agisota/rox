import { describe, expect, test } from "bun:test";
import {
	type ContactListItemInput,
	contactInitials,
	mapContactCards,
	mapContactLinks,
	type NeighborEdge,
	type NeighborNode,
	toContactCard,
} from "./crm-contacts";

/**
 * Pure mapping for the CRM contacts surface: contact list rows → cards, and a
 * contact's `graph.neighbors` result → its linked-object rows. No React / tRPC.
 * Shared single source of truth reused by the web AND desktop panels.
 */

function item(
	over: Partial<ContactListItemInput> & { entityId: string },
): ContactListItemInput {
	return {
		slug: null,
		title: "Untitled",
		displayName: null,
		primaryEmail: null,
		avatarUrl: null,
		isSelf: false,
		fieldCount: 0,
		...over,
	};
}

describe("contactInitials", () => {
	test("first letters of the first two words", () => {
		expect(contactInitials("Ada Lovelace")).toBe("AL");
		expect(contactInitials("Grace Brewster Hopper")).toBe("GB");
	});
	test("first two chars of a single token", () => {
		expect(contactInitials("Ada")).toBe("AD");
	});
	test("empty / whitespace → ?", () => {
		expect(contactInitials("")).toBe("?");
		expect(contactInitials("   ")).toBe("?");
	});
});

describe("toContactCard", () => {
	test("prefers the detail displayName and exposes a mailto action", () => {
		const card = toContactCard(
			item({
				entityId: "c1",
				title: "node-title",
				displayName: "Ada Lovelace",
				primaryEmail: "ada@analytical.engine",
			}),
		);
		expect(card.name).toBe("Ada Lovelace");
		expect(card.initials).toBe("AL");
		expect(card.email).toBe("ada@analytical.engine");
		expect(card.mailtoHref).toBe("mailto:ada@analytical.engine");
		expect(card.subtitle).toBe("ada@analytical.engine");
	});

	test("falls back to the node title when there is no detail displayName", () => {
		const card = toContactCard(item({ entityId: "c2", title: "Walk-in Lead" }));
		expect(card.name).toBe("Walk-in Lead");
		expect(card.mailtoHref).toBeNull();
	});

	test("subtitle uses a pluralized field-count hint when no email", () => {
		expect(toContactCard(item({ entityId: "a", fieldCount: 1 })).subtitle).toBe(
			"1 поле",
		);
		expect(toContactCard(item({ entityId: "b", fieldCount: 3 })).subtitle).toBe(
			"3 поля",
		);
		expect(toContactCard(item({ entityId: "c", fieldCount: 5 })).subtitle).toBe(
			"5 полей",
		);
		expect(
			toContactCard(item({ entityId: "d", fieldCount: 0 })).subtitle,
		).toBeNull();
	});

	test("blank avatar url collapses to null (initials fallback)", () => {
		expect(
			toContactCard(item({ entityId: "e", avatarUrl: "   " })).avatarUrl,
		).toBeNull();
	});

	test("mapContactCards preserves order", () => {
		const cards = mapContactCards([
			item({ entityId: "a", displayName: "A" }),
			item({ entityId: "b", displayName: "B" }),
		]);
		expect(cards.map((c) => c.entityId)).toEqual(["a", "b"]);
	});
});

describe("mapContactLinks", () => {
	const contactId = "contact-1";
	const nodes: NeighborNode[] = [
		{ entityId: contactId, kind: "contact", title: "Ada", slug: "ada" },
		{ entityId: "task-1", kind: "task", title: "Ship CRM", slug: "ship-crm" },
		{
			entityId: "note-1",
			kind: "note",
			title: "Call notes",
			slug: "call-notes",
		},
		{ entityId: "proj-1", kind: "project", title: "Rox", slug: "rox" },
	];

	function edge(over: Partial<NeighborEdge> & { id: string }): NeighborEdge {
		return {
			sourceEntityId: contactId,
			targetEntityId: null,
			relation: "references",
			resolved: true,
			...over,
		};
	}

	test("maps each resolved incident edge to the OTHER endpoint with labels + deep link", () => {
		const links = mapContactLinks({
			contactEntityId: contactId,
			nodes,
			edges: [
				edge({ id: "e1", targetEntityId: "task-1", relation: "about" }),
				// contact is the TARGET here (authored_by points contact← from a note)
				edge({
					id: "e2",
					sourceEntityId: "note-1",
					targetEntityId: contactId,
					relation: "authored_by",
				}),
			],
		});
		expect(links).toEqual([
			{
				entityId: "task-1",
				title: "Ship CRM",
				kindLabel: "Задача",
				relationLabel: "О контакте",
				href: "rox://tasks/ship-crm",
			},
			{
				entityId: "note-1",
				title: "Call notes",
				kindLabel: "Заметка",
				relationLabel: "Автор",
				href: "rox://notes/call-notes",
			},
		]);
	});

	test("skips unresolved edges, self-edges, and edges to pruned (missing) nodes", () => {
		const links = mapContactLinks({
			contactEntityId: contactId,
			nodes,
			edges: [
				edge({ id: "u", targetEntityId: "task-1", resolved: false }),
				edge({ id: "self", targetEntityId: contactId }),
				edge({ id: "missing", targetEntityId: "ghost-9" }),
			],
		});
		expect(links).toEqual([]);
	});

	test("a project link has no fabricated deep link (null href, still listed)", () => {
		const links = mapContactLinks({
			contactEntityId: contactId,
			nodes,
			edges: [edge({ id: "p", targetEntityId: "proj-1", relation: "about" })],
		});
		expect(links).toHaveLength(1);
		expect(links[0]?.kindLabel).toBe("Проект");
		expect(links[0]?.href).toBeNull();
	});

	test("de-duplicates the same (object, relation) pair", () => {
		const links = mapContactLinks({
			contactEntityId: contactId,
			nodes,
			edges: [
				edge({ id: "a", targetEntityId: "task-1", relation: "about" }),
				edge({ id: "b", targetEntityId: "task-1", relation: "about" }),
				// same object, DIFFERENT relation → kept
				edge({ id: "c", targetEntityId: "task-1", relation: "references" }),
			],
		});
		expect(links).toHaveLength(2);
		expect(links.map((l) => l.relationLabel)).toEqual(["О контакте", "Ссылка"]);
	});
});
