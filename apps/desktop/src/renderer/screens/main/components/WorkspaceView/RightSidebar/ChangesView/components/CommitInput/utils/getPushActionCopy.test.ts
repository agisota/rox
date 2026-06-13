import { describe, expect, test } from "bun:test";
import { getPushActionCopy } from "./getPushActionCopy";

describe("getPushActionCopy", () => {
	test("shows publish branch copy when no upstream or PR target exists", () => {
		expect(
			getPushActionCopy({
				hasUpstream: false,
				pushCount: 0,
			}),
		).toEqual({
			label: "Опубликовать ветку",
			menuLabel: "Опубликовать ветку",
			tooltip: "Опубликовать ветку в удалённом репозитории",
		});
	});

	test("shows generic push copy for tracked branches without a PR target", () => {
		expect(
			getPushActionCopy({
				hasUpstream: true,
				pushCount: 2,
			}),
		).toEqual({
			label: "Отправить",
			menuLabel: "Отправить",
			tooltip: "Отправить коммитов: 2",
		});
	});

	test("shows PR-specific push copy when an attached PR target exists", () => {
		expect(
			getPushActionCopy({
				hasUpstream: true,
				pushCount: 1,
				pullRequest: {
					headRefName: "feature/pr-branch",
					headRepositoryOwner: "Kitenite",
				},
			}),
		).toEqual({
			label: "Отправить в PR",
			menuLabel: "Отправить в PR",
			tooltip: "Отправить коммитов в Kitenite:feature/pr-branch: 1",
		});
	});
});
