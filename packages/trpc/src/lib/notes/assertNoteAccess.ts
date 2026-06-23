/**
 * `assertNoteAccess` — N1 fix. A note is owner-only by default (DQ1): a same-org
 * non-owner with no explicit USER grant is denied. Only `granteeType="user"`
 * grants are honored — `"organization"`/`"team"` grants are ignored on notes so
 * an org-wide grant cannot re-open N1.
 */

import type { db as defaultDb } from "@rox/db/client";
import { accessGrants, noteNotes, type SelectNoteNote } from "@rox/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

type Db = Pick<typeof defaultDb, "query">;
const RANK = { viewer: 1, editor: 2, owner: 3 } as const;

export async function assertNoteAccess(
	db: Db,
	args: {
		noteId: string;
		organizationId: string;
		userId: string;
		min: "viewer" | "editor";
	},
): Promise<{ note: SelectNoteNote; role: "owner" | "editor" | "viewer" }> {
	const note = await db.query.noteNotes.findFirst({
		where: and(
			eq(noteNotes.id, args.noteId),
			eq(noteNotes.organizationId, args.organizationId),
		),
	});
	if (!note) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
	}

	let role: "owner" | "editor" | "viewer" | null = null;
	if (note.ownerUserId === args.userId) {
		role = "owner";
	} else {
		const grant = await db.query.accessGrants.findFirst({
			where: and(
				eq(accessGrants.organizationId, args.organizationId),
				eq(accessGrants.resourceType, "note"),
				eq(accessGrants.resourceId, args.noteId),
				eq(accessGrants.granteeType, "user"), // NEVER organization/team (DQ1)
				eq(accessGrants.granteeId, args.userId),
			),
		});
		if (grant?.role === "admin" || grant?.role === "editor") role = "editor";
		else if (grant?.role === "viewer") role = "viewer";
	}

	if (!role || RANK[role] < RANK[args.min]) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "No access to this note",
		});
	}
	return { note, role };
}
