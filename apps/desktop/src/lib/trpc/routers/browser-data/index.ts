import { browserDataConsent, browserHistoryEntries } from "@rox/local-db";
import { and, eq, like, or, sql } from "drizzle-orm";
import { importHistoryForSource } from "main/lib/browser-import/browser-import";
import {
	BROWSER_SOURCES,
	type BrowserSource,
} from "main/lib/browser-import/browser-import.utils";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { canImportFromSource } from "./browser-data.utils";

const browserSourceSchema = z.enum(
	BROWSER_SOURCES as unknown as [string, ...string[]],
);

/** Read the single consent row, or null when the user has never decided. */
function readConsent() {
	return localDb.select().from(browserDataConsent).limit(1).get() ?? null;
}

/**
 * Browser-data IPC router (WS-N / D4 / N11).
 *
 * Owns the per-workspace history table (`browser_history_entries`) + the consent
 * record (`browser_data_consent`). Every capture/import path is gated on an
 * accepted, non-revoked consent row — nothing reads the user's OS browsers or
 * stores per-workspace history until they opt in.
 */
export const createBrowserDataRouter = () => {
	return router({
		/** Current consent state (null = never decided). */
		getConsent: publicProcedure.query(() => readConsent()),

		/** Opt in (or update allowed sources). Records acceptedAt, clears revoke. */
		setConsent: publicProcedure
			.input(z.object({ sources: z.array(browserSourceSchema) }))
			.mutation(({ input }) => {
				const existing = readConsent();
				const now = Date.now();
				if (existing) {
					localDb
						.update(browserDataConsent)
						.set({
							accepted: true,
							acceptedAt: now,
							revokedAt: null,
							sources: input.sources,
						})
						.where(eq(browserDataConsent.id, existing.id))
						.run();
				} else {
					localDb
						.insert(browserDataConsent)
						.values({
							accepted: true,
							acceptedAt: now,
							sources: input.sources,
						})
						.run();
				}
				return readConsent();
			}),

		/**
		 * Revoke consent: stop capture/upload (callers check `getConsent`) and
		 * purge ALL local browser-data rows so nothing lingers on the machine.
		 */
		revokeConsent: publicProcedure.mutation(() => {
			const existing = readConsent();
			if (existing) {
				localDb
					.update(browserDataConsent)
					.set({ accepted: false, revokedAt: Date.now() })
					.where(eq(browserDataConsent.id, existing.id))
					.run();
			}
			localDb.delete(browserHistoryEntries).run();
			return { purged: true } as const;
		}),

		/**
		 * Import the user's REAL browser history for `source` into the active
		 * workspace. No-op (returns 0) unless consent is accepted and the source
		 * was allowed. Conflicting (workspaceId, url, visitedAt) rows are skipped.
		 */
		importFromBrowser: publicProcedure
			.input(
				z.object({
					source: browserSourceSchema,
					workspaceId: z.string().min(1),
				}),
			)
			.mutation(({ input }) => {
				const consent = readConsent();
				if (!canImportFromSource(consent, input.source)) {
					return { imported: 0 } as const;
				}

				const rows = importHistoryForSource(input.source as BrowserSource);
				if (rows.length === 0) return { imported: 0 } as const;

				const now = Date.now();
				let imported = 0;
				for (const row of rows) {
					const result = localDb
						.insert(browserHistoryEntries)
						.values({
							workspaceId: input.workspaceId,
							url: row.url,
							title: row.title,
							faviconUrl: row.faviconUrl,
							source: "import",
							visitedAt: row.visitedAt,
							importedAt: now,
						})
						.onConflictDoNothing()
						.run();
					imported += result.changes;
				}
				return { imported } as const;
			}),

		/** Per-workspace history (most-recent first), for autocomplete. */
		getAll: publicProcedure
			.input(z.object({ workspaceId: z.string().min(1) }))
			.query(({ input }) => {
				return localDb
					.select()
					.from(browserHistoryEntries)
					.where(eq(browserHistoryEntries.workspaceId, input.workspaceId))
					.orderBy(sql`${browserHistoryEntries.visitedAt} desc`)
					.limit(500)
					.all();
			}),

		/** Per-workspace search over url/title. */
		search: publicProcedure
			.input(z.object({ workspaceId: z.string().min(1), query: z.string() }))
			.query(({ input }) => {
				const pattern = `%${input.query}%`;
				return localDb
					.select()
					.from(browserHistoryEntries)
					.where(
						and(
							eq(browserHistoryEntries.workspaceId, input.workspaceId),
							or(
								like(browserHistoryEntries.url, pattern),
								like(browserHistoryEntries.title, pattern),
							),
						),
					)
					.orderBy(sql`${browserHistoryEntries.visitedAt} desc`)
					.limit(10)
					.all();
			}),
	});
};
