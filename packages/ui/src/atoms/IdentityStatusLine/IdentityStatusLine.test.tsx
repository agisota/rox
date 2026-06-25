import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { IdentityStatusLine } from "./IdentityStatusLine";

const human = {
	id: "user_42",
	displayName: "Mark Lindgreen",
	handle: "mark",
	online: true,
};

const workspace = { id: "ws_1", name: "rox" };
const persona = { id: "persona_7", displayName: "Atlas" };

describe("IdentityStatusLine", () => {
	it("renders the КТО·ГДЕ·КАК segments and presence count", () => {
		const html = renderToStaticMarkup(
			<IdentityStatusLine
				human={human}
				workspace={workspace}
				persona={persona}
				onlineCount={3}
			/>,
		);
		expect(html).toContain("@mark");
		expect(html).toContain("#rox");
		expect(html).toContain("Atlas");
		expect(html).toContain("online");
		expect(html).toContain('data-testid="identity-status-line"');
		expect(html).toContain('data-testid="identity-status-workspace"');
		expect(html).toContain('data-testid="identity-status-persona"');
		expect(html).toContain('data-testid="identity-status-online-count"');
	});

	it("prefers the @handle over the display name for the human segment", () => {
		const html = renderToStaticMarkup(<IdentityStatusLine human={human} />);
		expect(html).toContain("@mark");
		expect(html).not.toContain(">Mark Lindgreen<");
	});

	it("falls back to the display name when no handle is set", () => {
		const html = renderToStaticMarkup(
			<IdentityStatusLine human={{ id: "user_42", displayName: "Mark" }} />,
		);
		expect(html).toContain("Mark");
	});

	it("shows the online dot only when the human is online", () => {
		const on = renderToStaticMarkup(<IdentityStatusLine human={human} />);
		expect(on).toContain('data-testid="identity-status-online-dot"');
		const off = renderToStaticMarkup(
			<IdentityStatusLine human={{ ...human, online: false }} />,
		);
		expect(off).not.toContain('data-testid="identity-status-online-dot"');
	});

	it("omits workspace and persona segments when absent", () => {
		const html = renderToStaticMarkup(<IdentityStatusLine human={human} />);
		expect(html).not.toContain('data-testid="identity-status-workspace"');
		expect(html).not.toContain('data-testid="identity-status-persona"');
	});

	it("hides the presence count when missing or below one", () => {
		const none = renderToStaticMarkup(<IdentityStatusLine human={human} />);
		expect(none).not.toContain('data-testid="identity-status-online-count"');
		const zero = renderToStaticMarkup(
			<IdentityStatusLine human={human} onlineCount={0} />,
		);
		expect(zero).not.toContain('data-testid="identity-status-online-count"');
	});

	it("attaches the container so truncation reacts to the slot width", () => {
		const html = renderToStaticMarkup(
			<IdentityStatusLine human={human} workspace={workspace} />,
		);
		expect(html).toContain("@container/identity-status-line");
	});

	it("compact form drops the container and keeps only avatar/glyph + count", () => {
		const html = renderToStaticMarkup(
			<IdentityStatusLine
				human={human}
				workspace={workspace}
				persona={persona}
				onlineCount={3}
				compact
			/>,
		);
		// No container and no *visible* text segments — just the identity carrier
		// + ·N. The full context still lives in the aria-label for screen readers.
		expect(html).not.toContain("@container/identity-status-line");
		expect(html).not.toContain('data-testid="identity-status-workspace"');
		expect(html).not.toContain('data-testid="identity-status-persona"');
		expect(html).not.toContain(">online<");
		expect(html).toContain('data-testid="identity-status-online-count"');
		expect(html).toContain("3");
	});

	it("honours custom presence and persona labels for localisation", () => {
		const html = renderToStaticMarkup(
			<IdentityStatusLine
				human={human}
				persona={persona}
				onlineCount={2}
				onlineLabel="онлайн"
				personaPrefix="как"
			/>,
		);
		expect(html).toContain("онлайн");
		expect(html).toContain("как");
	});

	it("exposes the whole context as a title + sr-only summary", () => {
		const html = renderToStaticMarkup(
			<IdentityStatusLine
				human={human}
				workspace={workspace}
				persona={persona}
				onlineCount={3}
			/>,
		);
		expect(html).toContain('title="@mark · #rox · as Atlas · 3 online"');
		expect(html).toContain(
			'class="sr-only">@mark · #rox · as Atlas · 3 online</span>',
		);
	});
});
