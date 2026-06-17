import { describe, expect, it } from "bun:test";
import {
	FIBERY_FALLBACK_TITLE,
	type FiberyEntity,
	mapFiberyEntities,
	mapFiberyEntityToTask,
} from "./sync";

const CTX = { organizationId: "org-1" };

describe("mapFiberyEntityToTask", () => {
	it("maps an entity with id, title and state", () => {
		const entity: FiberyEntity = {
			"fibery/id": "ent-1",
			name: "Ship the thing",
			state: "In Progress",
		};

		const task = mapFiberyEntityToTask(entity, CTX);

		expect(task).toEqual({
			organizationId: "org-1",
			externalProvider: "fibery",
			externalId: "ent-1",
			title: "Ship the thing",
			externalState: "In Progress",
		});
	});

	it("falls back to a default title when no title field is present", () => {
		const entity: FiberyEntity = { "fibery/id": "ent-2" };

		const task = mapFiberyEntityToTask(entity, CTX);

		expect(task?.title).toBe(FIBERY_FALLBACK_TITLE);
		expect(task?.externalState).toBeNull();
	});

	it("uses `title` alias when `name` is absent", () => {
		const entity: FiberyEntity = { "fibery/id": "ent-3", title: "From title" };

		expect(mapFiberyEntityToTask(entity, CTX)?.title).toBe("From title");
	});

	it("returns null when the entity has no fibery/id", () => {
		const entity: FiberyEntity = { name: "Orphan" };

		expect(mapFiberyEntityToTask(entity, CTX)).toBeNull();
	});
});

describe("mapFiberyEntities", () => {
	it("returns an empty array for an empty list", () => {
		expect(mapFiberyEntities([], CTX)).toEqual([]);
	});

	it("filters out entities without an id", () => {
		const entities: FiberyEntity[] = [
			{ "fibery/id": "a", name: "Keep me" },
			{ name: "Drop me" },
			{ "fibery/id": "", name: "Drop empty id" },
			{ "fibery/id": "b", title: "Keep me too" },
		];

		const mapped = mapFiberyEntities(entities, CTX);

		expect(mapped.map((t) => t.externalId)).toEqual(["a", "b"]);
	});
});
