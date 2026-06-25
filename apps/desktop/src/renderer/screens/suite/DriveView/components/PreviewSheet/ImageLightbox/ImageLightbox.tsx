import Lightbox from "yet-another-react-lightbox";
import Inline from "yet-another-react-lightbox/plugins/inline";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import "./ImageLightbox.css";

interface ImageLightboxProps {
	/** Presigned GET URL for the image bytes (straight from R2). */
	url: string;
	/** Accessible label / caption for the single slide. */
	alt: string;
}

/**
 * Inline zoom/pan image viewer embedded in the preview sheet body. Built on
 * `yet-another-react-lightbox` with the Zoom plugin: gives pinch-zoom, mouse
 * wheel zoom, double-click/tap, swipe and keyboard navigation for free, while
 * the Inline plugin keeps it docked inside the glass sheet (no full-screen
 * portal). Dark glass theming is driven through the library's CSS custom
 * properties in the co-located stylesheet; zoom animation is disabled when the
 * user prefers reduced motion.
 */
export function ImageLightbox({ url, alt }: ImageLightboxProps) {
	const reducedMotion = usePrefersReducedMotion();

	return (
		<Lightbox
			plugins={[Inline, Zoom]}
			slides={[{ src: url, alt }]}
			carousel={{ finite: true, padding: 0, spacing: 0, imageFit: "contain" }}
			zoom={{
				maxZoomPixelRatio: 5,
				zoomInMultiplier: 2,
				scrollToZoom: true,
				doubleClickMaxStops: 2,
				doubleTapDelay: reducedMotion ? 0 : 300,
			}}
			animation={
				reducedMotion
					? { zoom: 0, swipe: 0, navigation: 0 }
					: { zoom: 300, swipe: 300 }
			}
			controller={{ closeOnBackdropClick: false, closeOnPullDown: false }}
			render={{ buttonPrev: () => null, buttonNext: () => null }}
			className="rox-image-lightbox"
			inline={{ className: "rox-image-lightbox__inline" }}
		/>
	);
}
