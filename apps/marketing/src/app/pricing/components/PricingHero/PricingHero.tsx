import { GridCross } from "@/app/blog/components/GridCross";
import { GlossaryText } from "@/components/GlossaryTerm";

export function PricingHero() {
	return (
		<header className="relative border-b border-border">
			<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12 relative">
				<GridCross className="top-0 left-0" />
				<GridCross className="top-0 right-0" />

				<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
					Цены
				</span>
				<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
					Простые цены для любой команды
				</h1>
				<p className="text-muted-foreground mt-3 max-w-lg">
					<GlossaryText text="Начни бесплатно. Переходи на платный тариф, когда команда вырастет. Для организаций с расширенными требованиями к безопасности и соответствию требованиям доступны корпоративные планы." />
				</p>

				<GridCross className="bottom-0 left-0" />
				<GridCross className="bottom-0 right-0" />
			</div>
		</header>
	);
}
