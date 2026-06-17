// React Compiler can over-memoise the imperative R3F frame loop below; opt this
// scene out so every useFrame mutation runs untouched.
"use no memo";
"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { AGENT_ROLES, FACE, FIELD } from "../../constants";

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
	/** 1 for face-constellation particles (no spin, sit behind the rings). */
	isFace: Uint8Array;
	/** First index of the contiguous face-constellation block. */
	faceStart: number;
	/** Number of particles in the face-constellation block. */
	faceCount: number;
}

/** Load an <img> as a promise (same-origin: no taint, getImageData is allowed). */
function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

/**
 * Sample `count` points from the opaque pixels of an image's alpha channel and
 * map them into a camera-facing plane (world XY) centered on the origin. Used to
 * draw the logo-girl silhouette as a particle constellation.
 */
async function sampleFacePoints(count: number): Promise<Float32Array | null> {
	const out = new Float32Array(count * 3);
	try {
		const img = await loadImage(FACE.src);
		const naturalW = img.naturalWidth || img.width;
		const naturalH = img.naturalHeight || img.height;
		if (!naturalW || !naturalH) return null;

		const scale = Math.min(1, FACE.sampleMaxWidth / naturalW);
		const w = Math.max(1, Math.round(naturalW * scale));
		const h = Math.max(1, Math.round(naturalH * scale));

		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(img, 0, 0, w, h);
		const pixels = ctx.getImageData(0, 0, w, h).data;

		// Collect indices of pixels solid enough to belong to the silhouette.
		const candidates: number[] = [];
		const minAlpha = FACE.alphaThreshold * 255;
		for (let p = 0; p < w * h; p++) {
			if ((pixels[p * 4 + 3] ?? 0) >= minAlpha) candidates.push(p);
		}
		if (candidates.length === 0) return null;

		const worldH = FACE.worldHeight;
		const worldW = worldH * (w / h);
		for (let i = 0; i < count; i++) {
			const p = candidates[(Math.random() * candidates.length) | 0] ?? 0;
			const px = p % w;
			const py = (p / w) | 0;
			// Sub-pixel jitter so points don't snap to a visible grid.
			const jx = px + Math.random();
			const jy = py + Math.random();
			out[i * 3] = (jx / w - 0.5) * worldW;
			out[i * 3 + 1] = (0.5 - jy / h) * worldH;
			out[i * 3 + 2] = FACE.baseZ + (Math.random() - 0.5) * FACE.depth * 2;
		}
		return out;
	} catch {
		return null;
	}
}

/** Build the particle clouds: 3 tilted rings, a bright hub, and a halo nebula. */
function buildField(): FieldData {
	const count = FIELD.particleCount;
	const structured = new Float32Array(count * 3);
	const scattered = new Float32Array(count * 3);
	const colors = new Float32Array(count * 3);
	const sizes = new Float32Array(count);
	const isFace = new Uint8Array(count);

	const palette = AGENT_ROLES.map((role) => new THREE.Color(role.color));
	const white = new THREE.Color("#fff3e6");
	const faceTint = new THREE.Color("#ffd9b0");
	const tmp = new THREE.Color();
	const colorAt = (index: number) => palette[index] ?? white;

	// Ring shares are trimmed to leave room for the face constellation block.
	// Ring layout: radius, tube thickness, tilt about X, yaw about Y, share.
	const rings = [
		{ radius: 3.1, tube: 0.22, tiltX: 1.12, yaw: 0.0, share: 0.13, role: 1 },
		{ radius: 4.9, tube: 0.26, tiltX: 0.52, yaw: 0.7, share: 0.12, role: 2 },
		{ radius: 6.6, tube: 0.32, tiltX: 1.38, yaw: -0.4, share: 0.1, role: 3 },
	];
	const hubShare = 0.05;
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
			sizes[i] = 0.1 + Math.random() * 0.13;
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
		sizes[i] = 0.09 + Math.random() * 0.13;
	}
	cursor = hubEnd;

	// Face constellation block lives at the END of the buffer; its positions are
	// filled asynchronously from the logo alpha (see sampleFacePoints). The halo
	// fills whatever remains between the hub and the face block.
	const faceCount = Math.floor(count * FACE.share);
	const faceStart = count - faceCount;

	// Halo nebula — faint particles filling the surrounding volume.
	for (let i = cursor; i < faceStart; i++) {
		const r = 4 + Math.cbrt(Math.random()) * 6;
		const phi = Math.acos(2 * Math.random() - 1);
		const theta = Math.random() * Math.PI * 2;
		structured[i * 3] = r * Math.sin(phi) * Math.cos(theta);
		structured[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.5;
		structured[i * 3 + 2] = r * Math.cos(phi);
		const base = colorAt((Math.random() * palette.length) | 0);
		tmp.copy(base).lerp(white, Math.random() * 0.2);
		colors[i * 3] = tmp.r * 0.4;
		colors[i * 3 + 1] = tmp.g * 0.4;
		colors[i * 3 + 2] = tmp.b * 0.4;
		sizes[i] = 0.05 + Math.random() * 0.06;
	}

	// Face constellation — dim warm star-points. Until the image is sampled they
	// sit on a faint backdrop shell so they blend with the halo (and degrade
	// gracefully if the asset ever fails to load).
	for (let i = faceStart; i < count; i++) {
		isFace[i] = 1;
		const r = 7 + Math.random() * 3;
		const phi = Math.acos(2 * Math.random() - 1);
		const theta = Math.random() * Math.PI * 2;
		structured[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 0.6;
		structured[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7;
		structured[i * 3 + 2] = FACE.baseZ;

		// Occasional brighter, larger "stars" give the portrait some twinkle.
		const sparkle = Math.random() < 0.12;
		const brightness = sparkle
			? 1.5 + Math.random() * 0.5
			: 0.95 + Math.random() * 0.4;
		tmp.copy(faceTint).lerp(white, Math.random() * 0.4);
		colors[i * 3] = tmp.r * brightness;
		colors[i * 3 + 1] = tmp.g * brightness;
		colors[i * 3 + 2] = tmp.b * brightness;
		sizes[i] = (sparkle ? 0.16 : 0.08) + Math.random() * 0.05;
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

	return {
		count,
		structured,
		scattered,
		colors,
		sizes,
		edgeIndices,
		isFace,
		faceStart,
		faceCount,
	};
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

	// Interaction-driven orchestration: the swarm is chaotic by default and only
	// gathers into rings as the visitor moves the mouse (`activity`) or dispatches
	// a command (`dispatchUntil` holds it organised for a few seconds). `orch` is
	// the smoothed 0→1 organisation level; it decays back to chaos when idle.
	const orch = useRef(0);
	const activity = useRef(0);
	const lastPointer = useRef({ x: 0, y: 0 });
	const dispatchUntil = useRef(-10);

	// Clock origin for the intro coalesce (the swarm flies in from chaos and
	// assembles into the face + rings over the first few seconds after mount).
	const startTime = useRef(-1);

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
			const nx = (event.clientX / window.innerWidth) * 2 - 1;
			const ny = -((event.clientY / window.innerHeight) * 2 - 1);
			// Charge `activity` by how far the cursor moved this event (frame-rate
			// independent): deliberate movement quickly gathers the swarm.
			if (pointerNdc.current.active) {
				const dx = nx - lastPointer.current.x;
				const dy = ny - lastPointer.current.y;
				activity.current = Math.min(
					1,
					activity.current + Math.sqrt(dx * dx + dy * dy) * 18,
				);
			}
			pointerNdc.current.x = nx;
			pointerNdc.current.y = ny;
			pointerNdc.current.active = true;
			lastPointer.current.x = nx;
			lastPointer.current.y = ny;
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

	// Sample the logo silhouette once and write it into the face block's home
	// positions. The frame loop reads `structured` every frame, so no GL buffer
	// update is needed — particles simply gather toward the new targets.
	useEffect(() => {
		let cancelled = false;
		sampleFacePoints(data.faceCount).then((points) => {
			if (cancelled || !points) return;
			data.structured.set(points, data.faceStart * 3);
		});
		return () => {
			cancelled = true;
		};
	}, [data]);

	useFrame((state, delta) => {
		const t = state.clock.elapsedTime;
		uniforms.uPixelRatio.value = Math.min(state.gl.getPixelRatio(), 2);

		// A dispatched command both flashes the field and locks it organised for a
		// few seconds while the agents "run".
		if (pulse !== lastPulse.current) {
			lastPulse.current = pulse;
			pulseStart.current = t;
			dispatchUntil.current = t + 7;
		}

		const ndc = pointerNdc.current;

		// Time since this scene mounted (its own clock so the coalesce always
		// starts at 0 when the hero appears).
		if (startTime.current < 0) startTime.current = t;
		const local = t - startTime.current;

		// The swarm flies in from chaos and assembles into the face + rings, then
		// stays assembled (face backdrop + spinning rings on top). `baseFloor`
		// ramps up gradually so the coalesce is clearly visible (~4.5s); smoothstep
		// then pushes it close to 1 so the structure reads crisp. Pointer activity
		// and a command can still drive it to a hard 1.
		activity.current = Math.max(0, activity.current - delta * 0.15);
		const baseFloor = Math.min(0.95, local * 0.21);
		const orchTarget = Math.max(
			activity.current,
			baseFloor,
			t < dispatchUntil.current ? 1 : 0,
		);
		orch.current += (orchTarget - orch.current) * Math.min(delta * 3, 1);
		const o = orch.current;
		const ease = o * o * (3 - 2 * o);

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
		pointerVec.set(ndc.x, ndc.y);
		raycaster.setFromCamera(pointerVec, state.camera);
		raycaster.ray.intersectPlane(plane, pointerWorld.current);
		const px = pointerWorld.current.x;
		const py = pointerWorld.current.y;
		const pointerActive =
			ndc.active && Number.isFinite(px) && Number.isFinite(py);

		const structured = data.structured;
		const scattered = data.scattered;
		const isFace = data.isFace;
		const count = data.count;

		for (let i = 0; i < count; i++) {
			const ix = i * 3;
			const iy = ix + 1;
			const iz = ix + 2;

			const face = isFace[i] === 1;

			// Rings/hub/halo spin around Y (Saturn-style) and expand on a pulse.
			// The face constellation stays camera-facing (no spin, no expand) so the
			// portrait reads clearly behind the rotating rings.
			let rx: number;
			let ry: number;
			let rz: number;
			if (face) {
				rx = structured[ix] ?? 0;
				ry = structured[iy] ?? 0;
				rz = structured[iz] ?? 0;
			} else {
				const sx = (structured[ix] ?? 0) * expand;
				const sz = (structured[iz] ?? 0) * expand;
				rx = sx * cosY + sz * sinY;
				rz = -sx * sinY + sz * cosY;
				ry = (structured[iy] ?? 0) * expand;
			}

			// Chaos: on load the swarm flies in from a scattered cloud; the drift
			// fades out as the structure forms and then stays assembled.
			const chaos = 1 - ease;
			const cx =
				(scattered[ix] ?? 0) + Math.sin(t * 0.3 + i * 0.7) * 1.5 * chaos;
			const cy =
				(scattered[iy] ?? 0) + Math.cos(t * 0.27 + i * 1.3) * 1.5 * chaos;
			const cz =
				(scattered[iz] ?? 0) + Math.sin(t * 0.21 + i * 0.5) * 1.2 * chaos;

			// Blend chaos → structure, with a gentle living swirl once organised.
			// The face stays crisp (no swirl) so the silhouette is legible.
			const swirl = face ? 0 : Math.sin(t * 0.6 + i) * 0.05 * ease;
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
			mat.opacity = 0.05 * ease + impulse * 0.45;
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
