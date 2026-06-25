import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { SynthesizedAudio } from "../useTtsPlayback";
import { ListenButton } from "./ListenButton";

const noopSynthesize = (): Promise<SynthesizedAudio> =>
	Promise.resolve({ audioBase64: "", mimeType: "audio/mpeg" });

/**
 * FN-043 (#486): the "Прослушать" button reads agent replies aloud. These tests
 * pin its labelling and disabled affordance; the playback hook is exercised by
 * the protocol/edge-tts tests.
 */
describe("ListenButton", () => {
	it("renders the RU listen affordance with an accessible label", () => {
		const html = renderToStaticMarkup(
			<ListenButton text="Привет, мир" synthesize={noopSynthesize} />,
		);
		expect(html).toContain('aria-label="Прослушать"');
		expect(html).toContain("Прослушать");
		expect(html).toContain('type="button"');
	});

	it("is disabled when there is no text to read", () => {
		const html = renderToStaticMarkup(
			<ListenButton text="   " synthesize={noopSynthesize} />,
		);
		expect(html).toContain("disabled");
	});

	it("honors an explicit disabled prop", () => {
		const html = renderToStaticMarkup(
			<ListenButton text="есть текст" synthesize={noopSynthesize} disabled />,
		);
		expect(html).toContain("disabled");
	});
});
