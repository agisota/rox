// Docs are being rebuilt (new FumaDocs approach + new content).
// Temporary pass-through layout — the catch-all route renders a placeholder.
export default function Layout({ children }: LayoutProps<"/">) {
	return <main className="flex flex-1 flex-col">{children}</main>;
}
