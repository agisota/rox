/**
 * Shared base stub for `mock.module("drizzle-orm", …)` in router unit tests.
 *
 * Like {@link dbSchemaMockBase}, this exists because Bun's `mock.module` is
 * process-global and last-registration-wins per specifier. Different router
 * tests mock `drizzle-orm` with different operator subsets, so in a single
 * `bun test` process the *last* registered mock is what every router's static
 * `import { … } from "drizzle-orm"` links against. If that mock omits an
 * operator another router imports (e.g. `ilike`, `isNull`), the named import
 * fails to link with "Export named '…' not found" — and which mock wins depends
 * on test-file order, which differs between machines/CI (the classic
 * passes-locally-fails-in-CI trap).
 *
 * Spreading this base into every `drizzle-orm` mock guarantees the full union of
 * operators the router sources import is always present, regardless of order.
 * The returned shapes mirror the `{ type, … }` convention the existing tests
 * use; the mocked `@rox/db/client` never executes the queries they feed.
 */

type Op = (...args: unknown[]) => Record<string, unknown>;

const op =
	(type: string): Op =>
	(...args: unknown[]) => ({ type, args });

export const drizzleOrmMockBase = {
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	or: (...conditions: unknown[]) => ({ type: "or", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	ne: (left: unknown, right: unknown) => ({ type: "ne", left, right }),
	ilike: (left: unknown, right: unknown) => ({ type: "ilike", left, right }),
	inArray: (left: unknown, values: unknown) => ({
		type: "inArray",
		left,
		values,
	}),
	isNull: (value: unknown) => ({ type: "isNull", value }),
	isNotNull: (value: unknown) => ({ type: "isNotNull", value }),
	desc: (value: unknown) => ({ type: "desc", value }),
	asc: (value: unknown) => ({ type: "asc", value }),
	getTableColumns: op("columns"),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			type: "sql",
			strings,
			values,
		}),
		{ raw: (s: string) => ({ type: "raw", s }) },
	),
};
