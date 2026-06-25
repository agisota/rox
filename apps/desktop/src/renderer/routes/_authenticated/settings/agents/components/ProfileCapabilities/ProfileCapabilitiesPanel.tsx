import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { McpInventoryPanel } from "./components/McpInventoryPanel/McpInventoryPanel";
import { PluginsPanel } from "./components/PluginsPanel/PluginsPanel";
import { SkillsPanel } from "./components/SkillsPanel/SkillsPanel";

export interface ProfileCapabilitiesPanelProps {
	/**
	 * The persona whose capability set is shown. Capabilities follow the active
	 * persona (F21/F22): pass the active persona's id so switching persona swaps
	 * the panel's data.
	 */
	personaId: string;
}

/**
 * Per-persona capability panels (Hermes-borrow F47, #644).
 *
 * Three tabs over the single shared `profileCapabilities` tRPC router (the same
 * core web/mobile call):
 *   - Skills  — assignable per persona, with an `enabled/total` coverage badge.
 *   - MCP     — searchable inventory of servers/tools, coverage badge.
 *   - Plugins — read-only (no per-persona plugin assignment yet).
 *
 * No secret ever reaches this component: the router redacts server-side and the
 * inventory source is a name/description/category catalog.
 */
export function ProfileCapabilitiesPanel({
	personaId,
}: ProfileCapabilitiesPanelProps) {
	return (
		<Tabs defaultValue="skills" className="w-full">
			<TabsList>
				<TabsTrigger value="skills">Навыки</TabsTrigger>
				<TabsTrigger value="mcp">MCP</TabsTrigger>
				<TabsTrigger value="plugins">Плагины</TabsTrigger>
			</TabsList>
			<TabsContent value="skills">
				<SkillsPanel personaId={personaId} />
			</TabsContent>
			<TabsContent value="mcp">
				<McpInventoryPanel personaId={personaId} />
			</TabsContent>
			<TabsContent value="plugins">
				<PluginsPanel />
			</TabsContent>
		</Tabs>
	);
}
