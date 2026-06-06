import { COMPANY } from "@superset/shared/constants";

export function SupersetLogo() {
	return (
		<span className="inline-flex items-center gap-2 text-foreground">
			<span className="grid size-5 place-items-center rounded bg-foreground text-[10px] font-semibold text-background">
				СА
			</span>
			<span className="font-semibold">{COMPANY.NAME}</span>
		</span>
	);
}
