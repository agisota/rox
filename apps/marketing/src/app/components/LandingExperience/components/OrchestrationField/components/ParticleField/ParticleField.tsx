// React Compiler can over-memoise the imperative R3F frame loop below; opt this
// scene out so every useFrame mutation runs untouched.
"use no memo";
"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { AGENT_ROLES, FIELD } from "../../constants";

interface ParticleFieldProps {
	/**
	 * Monotonically increasing counter. Each increment dispatches an
	 * orchestration "pulse": the rings expand, spin faster and flash, then
	 * re-coalesce — the visual echo of a command being sent to the swarm.
	 */
	pulse: number;
}

/** Soft radial-gradient sprite so each particle reads as a glowing orb. */
function createGlowTexture(): THREE.Texture {
	const size = 64;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		const gradient = ctx.createRadialGradient(
			size / 2,
			size / 2,
			0,
			size / 2,
			size / 2,
			size / 2,
		);
		gradient.addColorStop(0, "rgba(255,255,255,1)");
		gradient.addColorStop(0.25, "rgba(255,255,255,0.85)");
		gradient.addColorStop(0.5, "rgba(255,255,255,0.32)");
		gradient.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, size, size);
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	return texture;
}

interface FieldData {
	count: number;
	/** Coalesced "orchestrated" home position per particle (xyz). */
	structured: Float32Array;
	/** Chaotic scattered start position per particle (xyz). */
	scattered: Float32Array;
	colors: Float32Array;
	sizes: Float32Array;
	/** Indices of ring particles used as delegation-edge endpoints. */
	edgeIndices: Uint32Array;
}

/** Build the particle clouds: 3 tilted rings, a bright hub, and a halo nebula. */
function buildField(): FieldData {
	const count = FIELD.particleCount;
	const structured = new Float32Array(count * 3);
	const scattered = new Float32Array(count * 3);
	const colors = new Float32Array(count * 3);
	const sizes = new Float32Array(count);

	const palette = AGENT_ROLES.map((role) => new THREE.Color(role.color));
	const white = new THREE.Color("#fff3e6");
	const tmp = new THREE.Color();
	const colorAt = (index: number) => palette[index] ?? white;

	// Ring layout: radius, tube thickness, tilt about X, yaw about Y, share.
	const rings = [
		{ radius: 3.1, tube: 0.22, tiltX: 1.12, yaw: 0.0, share: 0.22, role: 1 },
		{ radius: 4.9, tube: 0.26, tiltX: 0.52, yaw: 0.7, share: 0.24, role: 2 },
		{ radius: 6.6, tube: 0.32, tiltX: 1.38, yaw: -0.4, share: 0.22, role: 3 },
	];
	const hubShare = 0.1;
	let cursor = 0;

	const writeRing = (
		from: number,
		to: number,
		radius: number,
		tube: number,
		tiltX: number,
		yaw: number,
		roleIndex: number,
	) => {
		const rotX = new THREE.Matrix4().makeRotationX(tiltX);
		const rotY = new THREE.Matrix4().makeRotationY(yaw);
		const m = new THREE.Matrix4().multiplyMatrices(rotY, rotX);
		const v = new THREE.Vector3();
		for (let i = from; i < to; i++) {
			const theta = Math.random() * Math.PI * 2;
			const r = radius + (Math.random() - 0.5) * tube * 4;
			const tubeAngle = Math.random() * Math.PI * 2;
			const tubeR = Math.random() * tube;
			v.set(
				(r + tubeR * Math.cos(tubeAngle)) * Math.cos(theta),
				tubeR * Math.sin(tubeAngle),
				(r + tubeR * Math.cos(tubeAngle)) * Math.sin(theta),
			);
			v.applyMatrix4(m);
			structured[i * 3] = v.x;
			structured[i * 3 + 1] = v.y;
			structured[i * 3 + 2] = v.z;

			// Two-tone ring: mostly its role color, sometimes brand orange.
			const base = Math.random() < 0.78 ? colorAt(roleIndex) : colorAt(1);
			tmp.copy(base).lerp(white, Math.random() * 0.3);
			colors[i * 3] = tmp.r;
			colors[i * 3 + 1] = tmp.g;
			colors[i * 3 + 2] = tmp.b;
			sizes[i] = 0.12 + Math.random() * 0.16;
		}
	};

	for (const ring of rings) {
		const span = Math.floor(count * ring.share);
		writeRing(
			cursor,
			cursor + span,
			ring.radius,
			ring.tube,
			ring.tiltX,
			ring.yaw,
			ring.role,
		);
		cursor += span;
	}

	// Bright hub core — a small dense sphere of the warmest particles.
	const hubEnd = cursor + Math.floor(count * hubShare);
	for (let i = cursor; i < hubEnd; i++) {
		const r = Math.cbrt(Math.random()) * 1.05;
		const phi = Math.acos(2 * Math.random() - 1);
		const theta = Math.random() * Math.PI * 2;
		structured[i * 3] = r * Math.sin(phi) * Math.cos(theta);
		structured[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
		structured[i * 3 + 2] = r * Math.cos(phi);
		tmp.copy(colorAt(1)).lerp(white, 0.45 + Math.random() * 0.4);
		colors[i * 3] = tmp.r;
		colors[i * 3 + 1] = tmp.g;
		colors[i * 3 + 2] = tmp.b;
		sizes[i] = 0.1 + Math.random() * 0.16;
	}
	cursor = hubEnd;

	// Halo nebula — faint particles filling the surrounding volume.
	for (let i = cursor; i < count; i++) {
		const r = 4 + Math.cbrt(Math.random()) * 6;
		const phi = Math.acos(2 * Math.random() - 1);
		const theta = Math.random() * Math.PI * 2;
		structured[i * 3] = r * Math.sin(phi) * Math.cos(theta);
		structured[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.5;
		structured[i * 3 + 2] = r * Math.cos(phi);
		const base = colorAt((Math.random() * palette.length) | 0);
		tmp.copy(base).lerp(white, Math.random() * 0.2);
		colors[i * 3] = tmp.r * 0.65;
		colors[i * 3 + 1] = tmp.g * 0.65;
		colors[i * 3 + 2] = tmp.b * 0.65;
		sizes[i] = 0.06 + Math.random() * 0.09;
	}

	// Scattered start: a wide chaotic cloud the particles fly in from.
	for (let i = 0; i < count; i++) {
		const r = 6 + Math.random() * 12;
		const phi = Math.acos(2 * Math.random() - 1);
		const theta = Math.random() * Math.PI * 2;
		scattered[i * 3] = r * Math.sin(phi) * Math.cos(theta);
		scattered[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
		scattered[i * 3 + 2] = r * Math.cos(phi) - 3;
	}

	// Pick edge endpoints from the first (innermost two) rings for delegation
	// lines that connect outward from the hub.
	const innerShare = rings
		.slice(0, 2)
		.reduce((sum, ring) => sum + ring.share, 0);
	const ringTotal = Math.floor(count * innerShare);
	const edgeIndices = new Uint32Array(FIELD.edgeCount);
	for (let i = 0; i < FIELD.edgeCount; i++) {
		edgeIndices[i] = Math.floor(Math.random() * ringTotal);
	}

	return { count, structured, scattered, colors, sizes, edgeIndices };
}

const VERTEX_SHADER = /* glsl */ `
	attribute float aSize;
	attribute vec3 color;
	varying vec3 vColor;
	uniform float uPixelRatio;
	void main() {
		vColor = color;
		vec4 mv = modelViewMatrix * vec4(position, 1.0);
		gl_PointSize = aSize * uPixelRatio * (320.0 / -mv.z);
		gl_Position = projectionMatrix * mv;
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform sampler2D uTexture;
	uniform float uBoost;
	varying vec3 vColor;
	void main() {
		float a = texture2D(uTexture, gl_PointCoord).a;
		if (a < 0.02) discard;
		gl_FragColor = vec4(vColor * uBoost, 1.0) * a;
	}
`;

/** The animated points + delegation edges. */
function Swarm({ pulse }: ParticleFieldProps) {
	const pointsRef = useRef<THREE.Points>(null);
	const edgesRef = useRef<THREE.LineSegments>(null);

	const data = useMemo(buildField, []);
	const glow = useMemo(createGlowTexture, []);

	// Working position buffer mutated every frame.
	const positions = useMemo(
		() => new Float32Array(data.structured.length),
		[data],
	);
	const edgePositions = useMemo(
		() => new Float32Array(FIELD.edgeCount * 2 * 3),
		[],
	);

	// Keep a concrete handle on the uniforms so the frame loop can mutate them
	// without tripping ShaderMaterial's `{ [key]: IUniform }` index signature.
	const uniforms = useMemo(
		() => ({
			uTexture: { value: glow },
			uPixelRatio: { value: 1 },
			uBoost: { value: 1 },
		}),
		[glow],
	);

	const material = useMemo(
		() =>
			new THREE.ShaderMaterial({
				uniforms,
				vertexShader: VERTEX_SHADER,
				fragmentShader: FRAGMENT_SHADER,
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
			}),
		[uniforms],
	);

	// Pulse bookkeeping: each new `pulse` value starts an impulse at `mountTime`.
	const lastPulse = useRef(pulse);
	const pulseStart = useRef(-10);

	// Pointer attraction state (world-space point on the z=0 plane). We track the
	// cursor at the window level rather than via the canvas, so the wake works
	// even over the centered hero copy/controls that sit above the canvas.
	const pointerWorld = useRef(new THREE.Vector3());
	const pointerNdc = useRef({ x: 0, y: 0, active: false });
	const pointerVec = useMemo(() => new THREE.Vector2(), []);
	const plane = useMemo(
		() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
		[],
	);
	const raycaster = useMemo(() => new THREE.Raycaster(), []);

	useEffect(() => {
		const onMove = (event: PointerEvent) => {
			pointerNdc.current.x = (event.clientX / window.innerWidth) * 2 - 1;
			pointerNdc.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
			pointerNdc.current.active = true;
		};
		const onLeave = () => {
			pointerNdc.current.active = false;
		};
		window.addEventListener("pointermove", onMove, { passive: true });
		window.addEventListener("pointerout", onLeave);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerout", onLeave);
		};
	}, []);

	useFrame((state, delta) => {
		const t = state.clock.elapsedTime;
		uniforms.uPixelRatio.value = Math.min(state.gl.getPixelRatio(), 2);

		if (pulse !== lastPulse.current) {
			lastPulse.current = pulse;
			pulseStart.current = t;
		}

		// Coalesce from chaos → structure over the first ~3.6s (smoothstep).
		const intro = Math.min(t / 3.6, 1);
		const ease = intro * intro * (3 - 2 * intro);

		// Impulse decay after a command pulse (slow enough to read on screen).
		const since = t - pulseStart.current;
		const impulse = since >= 0 ? Math.exp(-since * 1.1) : 0;
		const expand = 1 + impulse * 0.7;
		// Whole-field brightness flash on a pulse — unmistakable visual payoff.
		uniforms.uBoost.value = 1 + impulse * 1.6;

		// Rotation: a steady Saturn-ring spin, briefly boosted by a pulse.
		const spin = t * 0.12 + impulse * since * 1.2;
		const cosY = Math.cos(spin);
		const sinY = Math.sin(spin);

		// Pointer → world point on the z=0 plane.
		const ndc = pointerNdc.current;
		pointerVec.set(ndc.x, ndc.y);
		raycaster.setFromCamera(pointerVec, state.camera);
		raycaster.ray.intersectPlane(plane, pointerWorld.current);
		const px = pointerWorld.current.x;
		const py = pointerWorld.current.y;
		const pointerActive =
			ndc.active && Number.isFinite(px) && Number.isFinite(py);

		const structured = data.structured;
		const scattered = data.scattered;
		const count = data.count;

		for (let i = 0; i < count; i++) {
			const ix = i * 3;
			const iy = ix + 1;
			const iz = ix + 2;

			// Spin the structured target around Y, then expand on pulse.
			const sx = (structured[ix] ?? 0) * expand;
			const sz = (structured[iz] ?? 0) * expand;
			const rx = sx * cosY + sz * sinY;
			const rz = -sx * sinY + sz * cosY;
			const ry = (structured[iy] ?? 0) * expand;

			// Blend chaos → structure, with a gentle living swirl.
			const swirl = Math.sin(t * 0.6 + i) * 0.05 * ease;
			const cx = scattered[ix] ?? 0;
			const cy = scattered[iy] ?? 0;
			const cz = scattered[iz] ?? 0;
			let x = cx + (rx - cx) * ease + swirl;
			let y = cy + (ry - cy) * ease + swirl;
			const z = cz + (rz - cz) * ease;

			// Pointer perturbation: push nearby particles outward (a soft wake).
			if (pointerActive) {
				const dx = x - px;
				const dy = y - py;
				const d2 = dx * dx + dy * dy;
				if (d2 < 16) {
					const f = (1 - d2 / 16) * 2.6;
					const inv = 1 / Math.sqrt(d2 + 0.001);
					x += dx * inv * f;
					y += dy * inv * f;
				}
			}

			positions[ix] = x;
			positions[iy] = y;
			positions[iz] = z;
		}

		const geom = pointsRef.current?.geometry;
		if (geom) {
			const attr = geom.getAttribute("position") as THREE.BufferAttribute;
			attr.needsUpdate = true;
		}

		// Delegation edges: hub (origin) → selected ring nodes, faded in with the
		// orchestration and brightened on a pulse.
		const edges = edgesRef.current;
		if (edges) {
			for (let e = 0; e < FIELD.edgeCount; e++) {
				const target = (data.edgeIndices[e] ?? 0) * 3;
				const base = e * 6;
				edgePositions[base] = 0;
				edgePositions[base + 1] = 0;
				edgePositions[base + 2] = 0;
				edgePositions[base + 3] = positions[target] ?? 0;
				edgePositions[base + 4] = positions[target + 1] ?? 0;
				edgePositions[base + 5] = positions[target + 2] ?? 0;
			}
			const eAttr = edges.geometry.getAttribute(
				"position",
			) as THREE.BufferAttribute;
			eAttr.needsUpdate = true;
			const mat = edges.material as THREE.LineBasicMaterial;
			mat.opacity = 0.12 * ease + impulse * 0.55;
		}

		// Subtle camera drift toward the pointer, parked slightly above the plane
		// so the tilted rings read as Saturn-like ellipses (3D depth).
		state.camera.position.x +=
			(ndc.x * 1.4 - state.camera.position.x) * delta * 1.5;
		state.camera.position.y +=
			(1.3 + ndc.y * 0.8 - state.camera.position.y) * delta * 1.5;
		state.camera.lookAt(0, 0, 0);
	});

	return (
		<group>
			<points ref={pointsRef} material={material}>
				<bufferGeometry>
					<bufferAttribute attach="attributes-position" args={[positions, 3]} />
					<bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
					<bufferAttribute attach="attributes-aSize" args={[data.sizes, 1]} />
				</bufferGeometry>
			</points>

			<lineSegments ref={edgesRef}>
				<bufferGeometry>
					<bufferAttribute
						attach="attributes-position"
						args={[edgePositions, 3]}
					/>
				</bufferGeometry>
				<lineBasicMaterial
					color="#ff9a4d"
					transparent
					opacity={0}
					depthWrite={false}
					blending={THREE.AdditiveBlending}
				/>
			</lineSegments>
		</group>
	);
}

/**
 * Full-bleed WebGL canvas hosting the orchestration {@link Swarm}. Mounted only
 * on capable devices (the parent gates this behind a capability check).
 */
export function ParticleField({ pulse }: ParticleFieldProps) {
	return (
		<Canvas
			camera={{ position: [0, 0, 15], fov: 55 }}
			dpr={[1, 2]}
			gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
			style={{ position: "absolute", inset: 0 }}
		>
			<Swarm pulse={pulse} />
		</Canvas>
	);
}
