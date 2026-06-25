import type { SearchFacet, SearchScope } from "@rox/shared/search";
import { z } from "zod";

/**
 * Input schema for the F16 cross-entity faceted search.
 *
 * `scope` is the discriminated `SearchScope` from `@rox/shared/search` (the
 * single source of truth shared with F15), expressed as a zod discriminated
 * union so an ill-formed scope (e.g. `project` without an id) is rejected at the
 * edge. `facets` optionally narrows which segments are queried; omitted = all
 * eligible for the scope.
 */
export const searchScopeSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("global") }),
	z.object({ type: z.literal("project"), projectId: z.string().uuid() }),
	z.object({ type: z.literal("chat"), sessionId: z.string().uuid() }),
]) satisfies z.ZodType<SearchScope>;

export const searchFacetSchema = z.enum([
	"titles",
	"messages",
	"toolCalls",
	"files",
]) satisfies z.ZodType<SearchFacet>;

export const searchSchema = z.object({
	query: z.string().trim().min(1).max(200),
	scope: searchScopeSchema.default({ type: "global" }),
	/** Restrict to these facets; empty/omitted = every facet eligible for scope. */
	facets: z.array(searchFacetSchema).max(4).optional(),
	/** Per-facet result cap (counts are computed independently of this). */
	limit: z.number().int().min(1).max(50).default(20),
});

export type SearchInput = z.infer<typeof searchSchema>;
