import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StateTransition } from "./StateTransition";

describe("StateTransition", () => {
	it("renders both the current and target state labels", () => {
		const html = renderToStaticMarkup(
			<StateTransition
				from={{ label: "bug reproduced", detail: "tests red" }}
				to={{ label: "tests passing", detail: "shipped" }}
			/>,
		);
		expect(html).toContain("bug reproduced");
		expect(html).toContain("tests passing");
	});
});
