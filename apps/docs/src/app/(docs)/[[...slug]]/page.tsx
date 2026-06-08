import type { Metadata } from "next";

// Docs are being rebuilt with a new FumaDocs approach and new content.
// Until then, every docs route renders this placeholder.
export const metadata: Metadata = {
	title: "Docs \u2014 coming soon",
	robots: { index: false, follow: false },
};

export default function Page() {
	return (
		<div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-6 text-center">
			<span className="text-muted-foreground mb-4 text-sm font-medium tracking-widest uppercase">
				Rox Docs
			</span>
			<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
				Documentation is on the way
			</h1>
			<p className="text-muted-foreground mt-4 text-base">
				We&apos;re rebuilding the Rox documentation from the ground up. Check
				back soon.
			</p>
			<a
				href="https://rox.one"
				className="mt-8 inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
			>
				\u2190 Back to rox.one
			</a>
		</div>
	);
}
