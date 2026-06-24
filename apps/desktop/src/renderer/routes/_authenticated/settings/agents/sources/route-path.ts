/**
 * Single source of truth for the in-desktop agent-sources route path.
 *
 * Shared by the route's command-palette wiring (the `agentNative.attachSource`
 * action navigates here once `agentNative.sourceMarketplace` is enabled) and the
 * tests that assert the routing, so the palette target and the registered
 * TanStack route can never silently drift. Kept dependency-free so the palette
 * module can import it without pulling in the renderer/tRPC stack.
 */
export const AGENT_SOURCES_ROUTE_PATH = "/settings/agents/sources" as const;
