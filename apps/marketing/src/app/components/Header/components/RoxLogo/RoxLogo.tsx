import Image from "next/image";
import styles from "./RoxLogo.module.css";

export function RoxLogo() {
	return (
		<span className={styles.logo}>
			<Image
				src="/rox-logo-light.png"
				alt="Rox"
				width={683}
				height={1040}
				className="h-9 w-auto"
				priority
			/>
			<span className={styles.tie} aria-hidden="true" />
		</span>
	);
}
