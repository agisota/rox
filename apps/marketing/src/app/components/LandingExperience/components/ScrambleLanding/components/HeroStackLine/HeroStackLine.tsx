import type { LandingTerm } from "../../../../constants";
import {
	HERO_BYOM_TERMS,
	HERO_ROX_ORCHESTRATION_TERM,
	HERO_STACK_TERM,
} from "../../../../constants";
import { Term } from "../Term";

function TermJoin({
	terms,
	separator,
}: {
	terms: ReadonlyArray<LandingTerm>;
	separator: string;
}) {
	return (
		<>
			{terms.map((term, index) => (
				<span key={term.label}>
					{index > 0 ? separator : null}
					<Term label={term.label} tip={term.tip} />
				</span>
			))}
		</>
	);
}

/** Hero hint with per-word glossary terms for BYOM/BYOA/BYOH, стэке, and Rox orchestration. */
export function HeroStackLine() {
	return (
		<>
			<TermJoin terms={HERO_BYOM_TERMS} separator=" + " />: залетай на любом
			привычном <Term {...HERO_STACK_TERM} /> или сходу газуй на заряженном
			агенте Rox One, - он <Term {...HERO_ROX_ORCHESTRATION_TERM} /> справится с
			этим зоопарком галлюциногенов
		</>
	);
}
