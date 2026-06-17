import type { LandingTerm } from "../../../../constants";
import {
	HERO_AGENT_TERMS,
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

/** Hero hint with per-word glossary terms for BYOM/BYOA/BYOH, стэк, and each agent. */
export function HeroStackLine() {
	return (
		<>
			<TermJoin terms={HERO_BYOM_TERMS} separator=" + " />: залетай на любом
			привычном <Term {...HERO_STACK_TERM} />{" "}
			<TermJoin terms={HERO_AGENT_TERMS} separator=", " />… ну, или сходу газуй
			на заряженном агенте Rox One, который{" "}
			<Term {...HERO_ROX_ORCHESTRATION_TERM} /> управится с любым нынешним
			зоопарком ИИ-решений
		</>
	);
}
