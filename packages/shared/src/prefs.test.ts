import { describe, expect, it } from "bun:test";
import {
	applyOrgSettingsPatch,
	applyUserPreferencesPatch,
	emptyOrgSettingsDoc,
	emptyUserPreferencesDoc,
	mergeOrgSettingsLWW,
	mergePreferencesLWW,
	userPreferencesDocSchema,
} from "./prefs";

describe("emptyUserPreferencesDoc", () => {
	it("produces a full document with zeroed values and timestamps", () => {
		const doc = emptyUserPreferencesDoc();
		expect(doc.pins).toEqual([]);
		expect(doc.tagPrefs).toEqual([]);
		expect(doc.savedViews).toEqual([]);
		expect(doc.disclosure).toEqual({});
		expect(doc.locale).toBe("");
		expect(doc.rightPanelPeek).toBe(false);
		expect(doc.pinsUpdatedAt).toBe(0);
		expect(doc.localeUpdatedAt).toBe(0);
	});

	it("round-trips through JSON (serializable core invariant)", () => {
		const doc = applyUserPreferencesPatch(
			emptyUserPreferencesDoc(),
			{ pins: [{ kind: "task", id: "t1", position: 0 }], locale: "ru" },
			1000,
		);
		const parsed = userPreferencesDocSchema.parse(
			JSON.parse(JSON.stringify(doc)),
		);
		expect(parsed).toEqual(doc);
	});
});

describe("applyUserPreferencesPatch", () => {
	it("stamps only the patched fields and advances only their timestamps", () => {
		const base = emptyUserPreferencesDoc();
		const next = applyUserPreferencesPatch(base, { locale: "ru" }, 5000);
		expect(next.locale).toBe("ru");
		expect(next.localeUpdatedAt).toBe(5000);
		// untouched fields keep their zero timestamp
		expect(next.pinsUpdatedAt).toBe(0);
		expect(next.rightPanelPeekUpdatedAt).toBe(0);
	});
});

describe("mergePreferencesLWW", () => {
	it("keeps the newer value per field independently", () => {
		// device A set locale at t=10, pins untouched
		const a = applyUserPreferencesPatch(
			emptyUserPreferencesDoc(),
			{ locale: "en" },
			10,
		);
		// device B set pins at t=20, locale untouched
		const b = applyUserPreferencesPatch(
			emptyUserPreferencesDoc(),
			{ pins: [{ kind: "doc", id: "d1", position: 0 }] },
			20,
		);
		// merging B into A keeps A's locale AND gains B's pins (different fields)
		const merged = mergePreferencesLWW(a, b);
		expect(merged.locale).toBe("en");
		expect(merged.pins).toEqual([{ kind: "doc", id: "d1", position: 0 }]);
	});

	it("resolves same-field conflict to the later timestamp", () => {
		const older = applyUserPreferencesPatch(
			emptyUserPreferencesDoc(),
			{ locale: "en" },
			10,
		);
		const newer = applyUserPreferencesPatch(
			emptyUserPreferencesDoc(),
			{ locale: "ru" },
			30,
		);
		expect(mergePreferencesLWW(older, newer).locale).toBe("ru");
		// merge is order-independent for the winning timestamp
		expect(mergePreferencesLWW(newer, older).locale).toBe("ru");
	});

	it("is idempotent on a tie (keeps base)", () => {
		const base = applyUserPreferencesPatch(
			emptyUserPreferencesDoc(),
			{ locale: "ru" },
			10,
		);
		const incoming = applyUserPreferencesPatch(
			emptyUserPreferencesDoc(),
			{ locale: "en" },
			10,
		);
		expect(mergePreferencesLWW(base, incoming).locale).toBe("ru");
	});
});

describe("org settings", () => {
	it("empty doc has zeroed values", () => {
		const doc = emptyOrgSettingsDoc();
		expect(doc.defaultLocale).toBe("");
		expect(doc.sharedViews).toEqual([]);
		expect(doc.defaultLocaleUpdatedAt).toBe(0);
	});

	it("patch + LWW merge resolves per field", () => {
		const a = applyOrgSettingsPatch(
			emptyOrgSettingsDoc(),
			{ defaultLocale: "en" },
			10,
		);
		const b = applyOrgSettingsPatch(
			emptyOrgSettingsDoc(),
			{ defaultLocale: "ru" },
			20,
		);
		expect(mergeOrgSettingsLWW(a, b).defaultLocale).toBe("ru");
	});
});
