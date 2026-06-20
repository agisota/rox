import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { type MarkdownBlock, parseMarkdown } from "../../utils/parseMarkdown";

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
	1: "text-2xl font-bold",
	2: "text-xl font-semibold",
	3: "text-lg font-semibold",
};

function BlockView({ block }: { block: MarkdownBlock }) {
	if (block.kind === "heading") {
		return <Text className={HEADING_CLASS[block.level]}>{block.text}</Text>;
	}
	if (block.kind === "bullet") {
		return (
			<View className="flex-row gap-2">
				<Text className="text-muted-foreground">•</Text>
				<Text className="flex-1 text-foreground">{block.text}</Text>
			</View>
		);
	}
	return (
		<Text className="text-base leading-6 text-foreground">{block.text}</Text>
	);
}

interface MarkdownViewProps {
	markdown: string;
}

/**
 * Read-only markdown view: renders block-level structure (headings, bullets,
 * paragraphs) parsed by {@link parseMarkdown}. Inline markup is shown verbatim
 * (P0); a richer renderer is deferred.
 */
export function MarkdownView({ markdown }: MarkdownViewProps) {
	const blocks = parseMarkdown(markdown);
	if (blocks.length === 0) {
		return <Text className="text-muted-foreground">This note is empty.</Text>;
	}
	return (
		<View className="gap-3">
			{blocks.map((block, index) => (
				<BlockView key={`${block.kind}-${index}`} block={block} />
			))}
		</View>
	);
}
