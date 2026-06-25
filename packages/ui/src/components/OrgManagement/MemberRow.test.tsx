import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Table, TableBody } from "../ui/table";
import { MemberRow, type MemberRowMember } from "./MemberRow";

const member: MemberRowMember = {
	memberId: "m1",
	userId: "u1",
	name: "Mark Lindgreen",
	email: "mark@rox.one",
	image: null,
	role: "owner",
	createdAt: "2026-01-01",
};

function render(node: React.ReactNode): string {
	return renderToStaticMarkup(
		<Table>
			<TableBody>{node}</TableBody>
		</Table>,
	);
}

describe("MemberRow", () => {
	it("renders the member name, email and localized role", () => {
		const html = render(<MemberRow member={member} addedLabel="1 янв." />);
		expect(html).toContain("Mark Lindgreen");
		expect(html).toContain("mark@rox.one");
		expect(html).toContain("Владелец");
		expect(html).toContain("1 янв.");
	});

	it("shows the 'Вы' badge for the current user", () => {
		const html = render(<MemberRow member={member} isCurrentUser />);
		expect(html).toContain("Вы");
	});

	it("falls back to 'Неизвестно' when the name is missing", () => {
		const html = render(<MemberRow member={{ ...member, name: null }} />);
		expect(html).toContain("Неизвестно");
	});
});
