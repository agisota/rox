import { createFileRoute } from "@tanstack/react-router";
import { MonadGallery } from "./components/MonadGallery";

/**
 * `/monad` — the MONAD design-system gallery (preview · alpha).
 *
 * A standalone, unauthenticated reference surface that renders every MONAD
 * primitive, composite, and motion helper in one place so the system can be
 * verified visually on a local build. It mounts its own `MonadThemeProvider`
 * scope, so it never restyles the product shell.
 */
export const Route = createFileRoute("/monad/")({
	component: MonadGallery,
});
