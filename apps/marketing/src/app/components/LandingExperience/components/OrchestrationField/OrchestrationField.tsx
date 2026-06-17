"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LandingBackdrop } from "../ScrambleLanding/components/LandingBackdrop";

// WebGL scene is client-only and heavy: load it lazily, never on the server.
const ParticleField = dynamic(
	() => import("./components/ParticleField").then((m) => m.ParticleField),
	{ ssr: false },
);

interface OrchestrationFieldProps {
	/** Increment to dispatch an orchestration pulse (see ParticleField). */
	pulse?: number;
}

type Capability = "unknown" | "webgl" | "fallback";

/** Decide whether this device should run the WebGL field or the CSS fallback. */
function detectCapability(): Capability {
	if (typeof window === "undefined") return "unknown";

	const prefersReducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	const isCoarse = window.matchMedia("(pointer: coarse)").matches;
	const isNarrow = window.matchMedia("(max-width: 820px)").matches;
	const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory;
	const lowMemory = typeof deviceMemory === "number" && deviceMemory <= 4;

	if (prefersReducedMotion || isNarrow || (isCoarse && lowMemory)) {
		return "fallback";
	}

	// Confirm a WebGL context can actually be created.
	try {
		const canvas = document.createElement("canvas");
		const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
		return gl ? "webgl" : "fallback";
	} catch {
		return "fallback";
	}
}

/**
 * Mercury Command–inspired hero backdrop: a cosmic field of glowing "agent"
 * particles that coalesce from chaos into rotating orchestration rings. Falls
 * back to the original CSS device backdrop on mobile / reduced-motion / when
 * WebGL is unavailable, so the page is always fast and legible.
 */
export function OrchestrationField({ pulse = 0 }: OrchestrationFieldProps) {
	const [capability, setCapability] = useState<Capability>("unknown");

	useEffect(() => {
		setCapability(detectCapability());
	}, []);

	if (capability === "webgl") {
		return (
			<div className="rox-field" aria-hidden="true">
				<ParticleField pulse={pulse} />
				<div className="rox-field__vignette" />
			</div>
		);
	}

	// `unknown` (SSR / first paint) and `fallback` both render the CSS scene so
	// there is never an empty hero; WebGL swaps in after the capability check.
	return <LandingBackdrop />;
}
