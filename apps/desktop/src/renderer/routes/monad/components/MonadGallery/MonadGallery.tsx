import { Badge } from "@rox/ui/badge";
import { FontProvider, MonadThemeProvider } from "renderer/monad";
import { CompositesSection } from "../CompositesSection";
import { FoundationSection } from "../FoundationSection";
import { PrimitivesSection } from "../PrimitivesSection";
import { GalleryControls } from "./components/GalleryControls";

/**
 * The gallery shell. Establishes the MONAD token scope (graphite background +
 * blueprint grid come from `[data-monad-root]` / `.monad-blueprint`, so this
 * wrapper deliberately sets no background of its own) and lays out the
 * sections. Font, appearance, and motion controls live in `GalleryControls`.
 */
export function MonadGallery() {
	return (
		<MonadThemeProvider className="min-h-screen w-full overflow-y-auto">
			<FontProvider>
				<div className="w-full p-8">
					<header className="mb-8 flex flex-col gap-2">
						<div className="flex items-center gap-3">
							<h1 className="text-2xl font-semibold tracking-tight">MONAD</h1>
							<Badge variant="outline">preview · alpha</Badge>
						</div>
						<p
							className="max-w-2xl text-sm"
							style={{ color: "var(--monad-text-muted)" }}
						>
							Visual reference for the MONAD design system. Toggle each card
							into its active state, switch the font theme and appearance, and
							set motion to "off" to confirm the reduced-motion contract (every
							resting state stays visible, no animation).
						</p>
					</header>

					<GalleryControls />
					<PrimitivesSection />
					<CompositesSection />
					<FoundationSection />
				</div>
			</FontProvider>
		</MonadThemeProvider>
	);
}
