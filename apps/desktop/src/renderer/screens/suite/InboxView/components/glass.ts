/**
 * Shared glassmorphism class tokens for the inbox panels, per the surface spec
 * ("панели — bg-card/60 backdrop-blur border border-white/5; активная строка —
 * bg-accent/80; бейджи/пилюли — bg-white/5"). Centralized so the three panels
 * stay visually identical and the look can be tuned in one place.
 */

/** A glass panel surface (filter rail / list / reader column). */
export const GLASS_PANEL =
	"bg-card/60 backdrop-blur-md border border-white/5 rounded-xl";

/** A glass pill (count badges, snooze presets). */
export const GLASS_PILL = "bg-white/5";

/** Active list/rail row treatment. */
export const GLASS_ACTIVE = "bg-accent/80";
