import { Button } from "@rox/ui/button";
import {
	FontSwitcher,
	type MotionPreference,
	useMonadTheme,
	useMotionPreference,
} from "renderer/monad";

const MOTION_PREFERENCES: MotionPreference[] = ["full", "essential", "off"];

/**
 * The gallery's global controls: font theme (via the shared `FontSwitcher`),
 * dark/light appearance (ephemeral, gallery-local), and the persisted motion
 * preference. Setting motion to "off" is the quickest way to confirm the
 * reduced-motion contract across every card.
 */
export function GalleryControls() {
	const { appearance, toggleAppearance } = useMonadTheme();
	const { preference, level, setPreference } = useMotionPreference();

	return (
		<div
			className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-3 p-4"
			style={{
				borderRadius: "var(--monad-radius-lg)",
				border: "1px solid var(--monad-border)",
				background: "var(--monad-surface)",
			}}
		>
			<div className="flex items-center gap-2">
				<span
					className="text-xs uppercase tracking-wide"
					style={{ color: "var(--monad-text-muted)" }}
				>
					Font
				</span>
				<FontSwitcher />
			</div>

			<div className="flex items-center gap-2">
				<span
					className="text-xs uppercase tracking-wide"
					style={{ color: "var(--monad-text-muted)" }}
				>
					Appearance
				</span>
				<Button variant="outline" size="sm" onClick={toggleAppearance}>
					{appearance}
				</Button>
			</div>

			<div className="flex items-center gap-2">
				<span
					className="text-xs uppercase tracking-wide"
					style={{ color: "var(--monad-text-muted)" }}
				>
					Motion
				</span>
				{MOTION_PREFERENCES.map((pref) => (
					<Button
						key={pref}
						size="sm"
						variant={preference === pref ? "default" : "outline"}
						onClick={() => setPreference(pref)}
					>
						{pref}
					</Button>
				))}
				<span
					className="text-[11px]"
					style={{ color: "var(--monad-text-faint)" }}
				>
					effective: {level}
				</span>
			</div>
		</div>
	);
}
