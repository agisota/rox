"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

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

type FallbackParticleStyle = CSSProperties & {
	"--delay": string;
	"--drift-x": string;
	"--drift-y": string;
	"--opacity": number;
	"--size": string;
	"--x": string;
	"--y": string;
};

const FALLBACK_PARTICLES = Array.from({ length: 150 }, (_, index) => {
	const ring = index % 5;
	const phase = (index * 137.5) % 360;
	const radius = 10 + ((index * 17) % 46);
	const x =
		50 + Math.cos((phase * Math.PI) / 180) * radius * (0.92 + ring * 0.04);
	const y =
		46 + Math.sin((phase * Math.PI) / 180) * radius * (0.58 + ring * 0.07);

	return {
		id: `fallback-particle-${index}`,
		delay: `${-((index * 73) % 2600)}ms`,
		driftX: `${(((index * 19) % 31) - 15) * 0.12}rem`,
		driftY: `${(((index * 23) % 29) - 14) * 0.1}rem`,
		opacity: 0.32 + ((index * 11) % 38) / 100,
		size: `${1 + ((index * 7) % 4)}px`,
		x: `${Math.max(3, Math.min(97, x))}%`,
		y: `${Math.max(5, Math.min(92, y))}%`,
	};
});

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
 * Mercury Command-inspired hero backdrop: a cosmic field of glowing "agent"
 * particles that coalesce from chaos into a portrait-shaped constellation.
 * Mobile / reduced-motion / no-WebGL devices keep the same portrait + particle
 * language in CSS so the first viewport never falls back to the old device mockup.
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

	return <StaticParticlePortraitFallback />;
}

function StaticParticlePortraitFallback() {
	return (
		<div className="rox-field rox-field--fallback" aria-hidden="true">
			<div className="rox-field__fallback-particles">
				{FALLBACK_PARTICLES.map((particle) => (
					<span
						key={particle.id}
						className="rox-field__fallback-particle"
						style={
							{
								"--delay": particle.delay,
								"--drift-x": particle.driftX,
								"--drift-y": particle.driftY,
								"--opacity": particle.opacity,
								"--size": particle.size,
								"--x": particle.x,
								"--y": particle.y,
							} as FallbackParticleStyle
						}
					/>
				))}
			</div>
			<div className="rox-field__portrait" />
			<div className="rox-field__vignette" />
		</div>
	);
}
