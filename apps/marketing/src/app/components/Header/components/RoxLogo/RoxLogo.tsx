import Image from "next/image";

export function RoxLogo() {
	return (
		<Image
			src="/rox-logo-light.png"
			alt="Rox"
			width={683}
			height={1040}
			className="h-9 w-auto"
			priority
		/>
	);
}
