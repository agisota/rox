import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ExperimentalFeatureState } from "@rox/shared/experimental-features";
import { renderToStaticMarkup } from "react-dom/server";

// Control the resolved feature state the gate reads, without standing up tRPC.
let currentState: ExperimentalFeatureState = {
	id: "templates.marketplace",
	enabled: true,
	defaultEnabled: true,
	userOverride: null,
	availability: "available",
	dependencies: [],
};

mock.module("renderer/hooks/useExperimentalFeature", () => ({
	useExperimentalFeature: () => ({
		state: currentState,
		isLoading: false,
		refetch: async () => undefined,
	}),
}));

// The real gallery pulls many desktop providers; replace it with a stub that
// records the props it is rendered with so we can drive the apply callback (the
// engine result) without standing up the full project-creation stack.
interface CapturedGalleryProps {
	open: boolean;
	onCreated: (result: { projectId: string }) => void;
	onOpenChange: (open: boolean) => void;
}
// Stored in a holder + read through an accessor so TypeScript returns the
// declared union type at call sites instead of flow-narrowing the captured
// props to `null` (the only value it sees assigned synchronously).
const galleryCapture: { props: CapturedGalleryProps | null } = { props: null };
function readCapturedGalleryProps(): CapturedGalleryProps | null {
	return galleryCapture.props;
}

mock.module(
	"renderer/routes/_authenticated/components/TemplateGalleryModal",
	() => ({
		TemplateGalleryModal: (props: CapturedGalleryProps) => {
			galleryCapture.props = props;
			return null;
		},
	}),
);

const { TemplateMarketplaceLaunchpad } = await import(
	"./TemplateMarketplaceLaunchpad"
);

function setState(partial: Partial<ExperimentalFeatureState>) {
	currentState = { ...currentState, ...partial };
}

afterEach(() => {
	currentState = {
		id: "templates.marketplace",
		enabled: true,
		defaultEnabled: true,
		userOverride: null,
		availability: "available",
		dependencies: [],
	};
});

describe("TemplateMarketplaceLaunchpad gating", () => {
	it("renders the marketplace surface when enabled and available", () => {
		setState({ enabled: true, availability: "available" });

		const markup = renderToStaticMarkup(<TemplateMarketplaceLaunchpad />);

		expect(markup).toContain("Маркетплейс шаблонов");
		expect(markup).toContain("Открыть галерею");
	});

	it("hides the surface when the experiment is disabled", () => {
		setState({ enabled: false, availability: "available" });

		const markup = renderToStaticMarkup(
			<TemplateMarketplaceLaunchpad fallback={<span>off</span>} />,
		);

		expect(markup).not.toContain("Маркетплейс шаблонов");
		expect(markup).toContain("off");
	});

	it("hides the surface when availability is not 'available'", () => {
		setState({ enabled: true, availability: "needs_configuration" });

		const markup = renderToStaticMarkup(
			<TemplateMarketplaceLaunchpad fallback={<span>configure</span>} />,
		);

		expect(markup).not.toContain("Маркетплейс шаблонов");
		expect(markup).toContain("configure");
	});

	it("renders nothing usable when stubbed (not_implemented)", () => {
		setState({ enabled: true, availability: "not_implemented" });

		const markup = renderToStaticMarkup(<TemplateMarketplaceLaunchpad />);

		expect(markup).not.toContain("Маркетплейс шаблонов");
	});

	it("wires the gallery so applying a template reports the created project", () => {
		setState({ enabled: true, availability: "available" });
		galleryCapture.props = null;
		const onCreated = mock((_result: { projectId: string }) => {});

		// Rendering the available surface mounts the (mocked) gallery and captures
		// its props. The gallery's onCreated represents a successful real apply
		// from the existing project-creation engine.
		renderToStaticMarkup(
			<TemplateMarketplaceLaunchpad onCreated={onCreated} />,
		);

		const captured = readCapturedGalleryProps();
		if (!captured) throw new Error("Template gallery was not rendered");
		captured.onCreated({ projectId: "proj_123" });

		expect(onCreated).toHaveBeenCalledTimes(1);
		expect(onCreated).toHaveBeenCalledWith({ projectId: "proj_123" });
	});
});
