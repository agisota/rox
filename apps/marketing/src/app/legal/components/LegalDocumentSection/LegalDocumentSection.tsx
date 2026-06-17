import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { LegalPage } from "@/lib/legal";

function formatDate(date: string | Date): string {
	return new Date(date).toLocaleDateString("ru-RU", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

interface LegalDocumentSectionProps {
	page: LegalPage;
	headingLevel?: "h1" | "h2" | "h3";
}

export function LegalDocumentSection({
	page,
	headingLevel = "h2",
}: LegalDocumentSectionProps) {
	const Heading = headingLevel;
	const headingClassName =
		headingLevel === "h1"
			? "text-3xl sm:text-4xl font-medium text-foreground"
			: "text-2xl font-medium text-foreground sm:text-3xl";

	return (
		<section
			id={page.slug}
			className="scroll-mt-28 border-t border-border pt-10 first:border-t-0 first:pt-0"
		>
			<header className="mb-6">
				<Heading className={headingClassName}>{page.title}</Heading>
				{page.lastUpdated ? (
					<p className="mt-2 text-sm text-muted-foreground">
						Обновлено: {formatDate(page.lastUpdated)}
					</p>
				) : null}
			</header>

			<div className="prose max-w-none">
				<MDXRemote
					source={page.content}
					options={{
						mdxOptions: {
							remarkPlugins: [remarkGfm],
						},
					}}
				/>
			</div>
		</section>
	);
}
