import type { Quote, Wallpaper } from "@rox/shared/appearance";
import { StyleSheet, View } from "react-native";
import { WallpaperBackground } from "@/components/appearance/WallpaperBackground";
import { Text } from "@/components/ui/text";

/**
 * Split a quote's text around its `emphasis` substring so the emphasized part
 * can be styled differently. Returns `[before, emphasis, after]`; when there is
 * no (valid) emphasis the whole text lands in `before`.
 */
function splitEmphasis(quote: Quote): [string, string, string] {
	if (!quote.emphasis) return [quote.text, "", ""];
	const index = quote.text.indexOf(quote.emphasis);
	if (index === -1) return [quote.text, "", ""];
	return [
		quote.text.slice(0, index),
		quote.emphasis,
		quote.text.slice(index + quote.emphasis.length),
	];
}

/**
 * Full-screen motivational quote card.
 *
 * Renders the {@link Quote} centered over an optional wallpaper background with
 * a dark scrim for legibility. The optional `emphasis` substring is rendered in
 * an accent/italic style. Designed to be mounted as a full-screen overlay (e.g.
 * a loading screen) — it fills its parent via `StyleSheet.absoluteFill`.
 */
export function QuoteScreen({
	quote,
	wallpaper = null,
}: {
	quote: Quote;
	/** Optional background wallpaper rendered behind the scrim. */
	wallpaper?: Wallpaper | null;
}) {
	const [before, emphasis, after] = splitEmphasis(quote);

	return (
		<View style={StyleSheet.absoluteFill} className="bg-background">
			<WallpaperBackground wallpaper={wallpaper} />
			{/* Scrim: darkens the wallpaper so light text stays legible. */}
			<View
				style={StyleSheet.absoluteFill}
				className="bg-black/55"
				pointerEvents="none"
			/>
			<View className="flex-1 items-center justify-center px-10">
				<Text className="text-center text-3xl font-bold leading-snug text-white">
					{before}
					{emphasis ? (
						<Text className="text-3xl font-bold italic text-primary">
							{emphasis}
						</Text>
					) : null}
					{after}
				</Text>
				{quote.author ? (
					<Text className="mt-6 text-center text-base text-white/70">
						{`— ${quote.author}`}
					</Text>
				) : null}
			</View>
		</View>
	);
}
