// Ambient declaration for Bun's test runner module.
//
// The mobile app typechecks with Expo's tsconfig (no `bun-types`), but its unit
// tests run under `bun test` and import from `bun:test`. This minimal module
// declaration keeps `tsc --noEmit` green for the test files without editing the
// shared `apps/mobile/tsconfig.json`. It covers only the surface WS-G uses.
declare module "bun:test" {
	type TestFn = () => void | Promise<void>;

	export function describe(label: string, fn: () => void): void;
	export function test(label: string, fn: TestFn): void;
	export function it(label: string, fn: TestFn): void;
	export function beforeEach(fn: TestFn): void;
	export function afterEach(fn: TestFn): void;
	export function beforeAll(fn: TestFn): void;
	export function afterAll(fn: TestFn): void;

	interface Matchers {
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
		toBeNull(): void;
		toBeUndefined(): void;
		toBeDefined(): void;
		toHaveLength(expected: number): void;
		toContain(expected: unknown): void;
		not: Matchers;
	}

	export function expect(actual: unknown): Matchers;
}
