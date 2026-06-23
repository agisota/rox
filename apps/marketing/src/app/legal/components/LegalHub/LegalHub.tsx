import Link from "next/link";
import { getLegalHubPages, LEGAL_DOCUMENTS } from "@/lib/legal";
import { LegalContactsSpoiler } from "../LegalContactsSpoiler";
import { LegalDocumentSection } from "../LegalDocumentSection";

export function LegalHub() {
	const pages = getLegalHubPages();
	const pageBySlug = new Map(pages.map((page) => [page.slug, page]));

	return (
		<article className="max-w-3xl mx-auto px-6 sm:px-8">
			<header className="border-b border-border pb-8 mb-10">
				<h1 className="text-3xl sm:text-4xl font-medium text-foreground">
					Юридическая информация
				</h1>
				<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
					Условия использования, конфиденциальность, безопасность и иные
					документы Rox. Выберите раздел в оглавлении или пролистайте страницу.
				</p>
			</header>

			<nav
				className="mb-12 rounded-xl border border-border bg-muted/20 p-5 sm:p-6"
				aria-label="Оглавление документов"
			>
				<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Документы
				</p>
				<ul className="mt-4 grid gap-2 sm:grid-cols-2">
					{LEGAL_DOCUMENTS.map((entry) => (
						<li key={entry.slug}>
							<Link
								href={`#${entry.slug}`}
								className="text-sm text-foreground/85 underline-offset-4 transition-colors hover:text-foreground hover:underline"
							>
								{entry.title}
							</Link>
						</li>
					))}
				</ul>
			</nav>

			<div className="space-y-2">
				{LEGAL_DOCUMENTS.map((entry) => {
					const page = pageBySlug.get(entry.slug);
					if (!page) return null;
					return <LegalDocumentSection key={page.slug} page={page} />;
				})}
			</div>

			<LegalContactsSpoiler />
		</article>
	);
}
