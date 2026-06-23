import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentSection } from "@/app/legal/components/LegalDocumentSection";
import { getAllLegalSlugs, getLegalPage } from "@/lib/legal";

interface PageProps {
	params: Promise<{ slug: string }>;
}

export default async function LegalSlugPage({ params }: PageProps) {
	const { slug } = await params;
	const page = getLegalPage(slug);

	if (!page) {
		notFound();
	}

	return (
		<main className="bg-background pt-24 pb-16 min-h-screen">
			<article className="max-w-3xl mx-auto px-6 sm:px-8">
				<LegalDocumentSection page={page} headingLevel="h1" />
			</article>
		</main>
	);
}

export async function generateStaticParams() {
	return getAllLegalSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const page = getLegalPage(slug);

	if (!page) {
		return {};
	}

	return {
		title: `${page.title} - Rox`,
		description: page.description,
	};
}
