import { describe, expect, it } from "bun:test";
import { formatOrganizationRole, ORGANIZATION_ROLE_LABELS } from "./roles";

describe("formatOrganizationRole", () => {
	it("maps each known role to its Russian label", () => {
		expect(formatOrganizationRole("owner")).toBe("Владелец");
		expect(formatOrganizationRole("admin")).toBe("Администратор");
		expect(formatOrganizationRole("member")).toBe("Участник");
	});

	it("exposes a complete label map", () => {
		expect(Object.keys(ORGANIZATION_ROLE_LABELS).sort()).toEqual([
			"admin",
			"member",
			"owner",
		]);
	});
});
