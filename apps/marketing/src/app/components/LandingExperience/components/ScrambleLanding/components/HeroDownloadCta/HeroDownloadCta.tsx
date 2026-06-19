import Link from "next/link";

function DownloadArrowIcon() {
	return (
		<svg
			className="rox-landing__hero-cta__arrow-icon"
			viewBox="0 0 12 14"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M6 1.25v9.5"
				stroke="currentColor"
				strokeWidth="1"
				strokeLinecap="round"
			/>
			<path
				d="M2.75 8.25 6 11.75 9.25 8.25"
				stroke="currentColor"
				strokeWidth="1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function HeroDownloadCta() {
	return (
		<Link className="rox-landing__hero-cta" href="/download">
			<span className="rox-landing__hero-cta__label">Скачать для macOS</span>
			<span className="rox-landing__hero-cta__arrow">
				<DownloadArrowIcon />
			</span>
		</Link>
	);
}
