interface TermProps {
	label: string;
	tip: string;
}

/**
 * An inline glossary term: an underlined word that reveals a tooltip on hover or
 * keyboard focus. Used in the landing feature list to explain each supported
 * agent/editor integration (and the acpx orchestration layer).
 *
 * Kept OUT of `.rox-scramble` elements on purpose — scrambleText rewrites
 * innerHTML and would wipe the interactive markup.
 */
export function Term({ label, tip }: TermProps) {
	return (
		<button type="button" className="rox-term">
			{label}
			<span className="rox-term__tip" role="tooltip">
				{tip}
			</span>
		</button>
	);
}
