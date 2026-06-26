import { mermaid } from "@streamdown/mermaid";
import type { PluginConfig } from "streamdown";

const streamdownCompatibleMermaid = mermaid as NonNullable<
	PluginConfig["mermaid"]
>;

export const streamdownMermaidPlugins = {
	mermaid: streamdownCompatibleMermaid,
} satisfies PluginConfig;
