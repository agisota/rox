import "./cpu-architecture.css";

export interface CpuArchitectureSvgProps {
	className?: string;
	width?: string;
	height?: string;
	text?: string;
	animateText?: boolean;
	lineMarkerSize?: number;
	animateLines?: boolean;
	animateMarkers?: boolean;
}

/**
 * Animated CPU-architecture wordmark, adapted from the 21st.dev
 * "cpu-architecture" component. The dark chip rectangle and the connection pins
 * are removed so the mark reads as glowing circuit traces and travelling light
 * beams wrapped around a single centered, enlarged word (defaults to "ROX").
 *
 * The eight traces draw themselves in (stroke-dashoffset), eight light beams
 * travel each trace via CSS `offset-path` (see cpu-architecture.css), and the
 * centered word fills with an animated three-stop gradient.
 */
function CpuArchitecture({
	className,
	width = "100%",
	height = "100%",
	text = "ROX",
	animateText = true,
	lineMarkerSize = 18,
	animateLines = true,
	animateMarkers = true,
}: CpuArchitectureSvgProps) {
	return (
		<svg
			className={className}
			width={width}
			height={height}
			viewBox="0 0 200 100"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			{/* Animated connection lines (traces) */}
			<g
				stroke="currentColor"
				fill="none"
				strokeWidth="0.3"
				strokeDasharray="100 100"
				pathLength="100"
				markerStart="url(#cpu-circle-marker)"
			>
				{/* 1st trace */}
				<path
					strokeDasharray="100 100"
					pathLength="100"
					d="M 10 20 h 79.5 q 5 0 5 5 v 30"
				/>
				{/* 2nd trace */}
				<path
					strokeDasharray="100 100"
					pathLength="100"
					d="M 180 10 h -69.7 q -5 0 -5 5 v 30"
				/>
				{/* 3rd trace */}
				<path d="M 130 20 v 21.8 q 0 5 -5 5 h -10" />
				{/* 4th trace */}
				<path d="M 170 80 v -21.8 q 0 -5 -5 -5 h -50" />
				{/* 5th trace */}
				<path
					strokeDasharray="100 100"
					pathLength="100"
					d="M 135 65 h 15 q 5 0 5 5 v 10 q 0 5 -5 5 h -39.8 q -5 0 -5 -5 v -20"
				/>
				{/* 6th trace */}
				<path d="M 94.8 95 v -36" />
				{/* 7th trace */}
				<path d="M 88 88 v -15 q 0 -5 -5 -5 h -10 q -5 0 -5 -5 v -5 q 0 -5 5 -5 h 14" />
				{/* 8th trace */}
				<path d="M 30 30 h 25 q 5 0 5 5 v 6.5 q 0 5 5 5 h 20" />
				{/* Animation */}
				{animateLines && (
					<animate
						attributeName="stroke-dashoffset"
						from="100"
						to="0"
						dur="1s"
						fill="freeze"
						calcMode="spline"
						keySplines="0.25,0.1,0.5,1"
						keyTimes="0; 1"
					/>
				)}
			</g>

			{/* Light beams travelling along the traces */}
			<g mask="url(#cpu-mask-1)">
				<circle
					className="cpu-architecture cpu-line-1"
					cx="0"
					cy="0"
					r="8"
					fill="url(#cpu-blue-grad)"
				/>
			</g>
			<g mask="url(#cpu-mask-2)">
				<circle
					className="cpu-architecture cpu-line-2"
					cx="0"
					cy="0"
					r="8"
					fill="url(#cpu-yellow-grad)"
				/>
			</g>
			<g mask="url(#cpu-mask-3)">
				<circle
					className="cpu-architecture cpu-line-3"
					cx="0"
					cy="0"
					r="8"
					fill="url(#cpu-pinkish-grad)"
				/>
			</g>
			<g mask="url(#cpu-mask-4)">
				<circle
					className="cpu-architecture cpu-line-4"
					cx="0"
					cy="0"
					r="8"
					fill="url(#cpu-white-grad)"
				/>
			</g>
			<g mask="url(#cpu-mask-5)">
				<circle
					className="cpu-architecture cpu-line-5"
					cx="0"
					cy="0"
					r="8"
					fill="url(#cpu-green-grad)"
				/>
			</g>
			<g mask="url(#cpu-mask-6)">
				<circle
					className="cpu-architecture cpu-line-6"
					cx="0"
					cy="0"
					r="8"
					fill="url(#cpu-orange-grad)"
				/>
			</g>
			<g mask="url(#cpu-mask-7)">
				<circle
					className="cpu-architecture cpu-line-7"
					cx="0"
					cy="0"
					r="8"
					fill="url(#cpu-cyan-grad)"
				/>
			</g>
			<g mask="url(#cpu-mask-8)">
				<circle
					className="cpu-architecture cpu-line-8"
					cx="0"
					cy="0"
					r="8"
					fill="url(#cpu-rose-grad)"
				/>
			</g>

			{/* Centered wordmark — knockout plate keeps traces off the letters. */}
			<rect x="68" y="36" width="64" height="26" rx="5" fill="#000000" />
			<text
				x="100"
				y="52"
				fontSize="14"
				fontWeight="600"
				letterSpacing="0.08em"
				textAnchor="middle"
				fill={animateText ? "url(#cpu-text-gradient)" : "currentColor"}
			>
				{text}
			</text>

			<defs>
				{/*
				 * 1 - Masks restrict each light beam to its trace path. The stroke
				 *     width is wider than the trace so the glow reads as a halo.
				 */}
				<mask id="cpu-mask-1">
					<path
						d="M 10 20 h 79.5 q 5 0 5 5 v 24"
						strokeWidth="0.5"
						stroke="white"
					/>
				</mask>
				<mask id="cpu-mask-2">
					<path
						d="M 180 10 h -69.7 q -5 0 -5 5 v 24"
						strokeWidth="0.5"
						stroke="white"
					/>
				</mask>
				<mask id="cpu-mask-3">
					<path
						d="M 130 20 v 21.8 q 0 5 -5 5 h -10"
						strokeWidth="0.5"
						stroke="white"
					/>
				</mask>
				<mask id="cpu-mask-4">
					<path
						d="M 170 80 v -21.8 q 0 -5 -5 -5 h -50"
						strokeWidth="0.5"
						stroke="white"
					/>
				</mask>
				<mask id="cpu-mask-5">
					<path
						d="M 135 65 h 15 q 5 0 5 5 v 10 q 0 5 -5 5 h -39.8 q -5 0 -5 -5 v -20"
						strokeWidth="0.5"
						stroke="white"
					/>
				</mask>
				<mask id="cpu-mask-6">
					<path d="M 94.8 95 v -36" strokeWidth="0.5" stroke="white" />
				</mask>
				<mask id="cpu-mask-7">
					<path
						d="M 88 88 v -15 q 0 -5 -5 -5 h -10 q -5 0 -5 -5 v -5 q 0 -5 5 -5 h 14"
						strokeWidth="0.5"
						stroke="white"
					/>
				</mask>
				<mask id="cpu-mask-8">
					<path
						d="M 30 30 h 25 q 5 0 5 5 v 6.5 q 0 5 5 5 h 20"
						strokeWidth="0.5"
						stroke="white"
					/>
				</mask>

				{/* 2 - Gradients for the travelling light beams */}
				<radialGradient id="cpu-blue-grad" fx="1">
					<stop offset="0%" stopColor="#00E8ED" />
					<stop offset="50%" stopColor="#08F" />
					<stop offset="100%" stopColor="transparent" />
				</radialGradient>
				<radialGradient id="cpu-yellow-grad" fx="1">
					<stop offset="0%" stopColor="#FFD800" />
					<stop offset="50%" stopColor="#FFD800" />
					<stop offset="100%" stopColor="transparent" />
				</radialGradient>
				<radialGradient id="cpu-pinkish-grad" fx="1">
					<stop offset="0%" stopColor="#830CD1" />
					<stop offset="50%" stopColor="#FF008B" />
					<stop offset="100%" stopColor="transparent" />
				</radialGradient>
				<radialGradient id="cpu-white-grad" fx="1">
					<stop offset="0%" stopColor="#FFF" />
					<stop offset="50%" stopColor="#FFF" />
					<stop offset="100%" stopColor="transparent" />
				</radialGradient>
				<radialGradient id="cpu-green-grad" fx="1">
					<stop offset="0%" stopColor="#22C55E" />
					<stop offset="50%" stopColor="#057D34" />
					<stop offset="100%" stopColor="transparent" />
				</radialGradient>
				<radialGradient id="cpu-orange-grad" fx="1">
					<stop offset="0%" stopColor="#FF9A4D" />
					<stop offset="50%" stopColor="#F0792A" />
					<stop offset="100%" stopColor="transparent" />
				</radialGradient>
				<radialGradient id="cpu-cyan-grad" fx="1">
					<stop offset="0%" stopColor="#00E8ED" />
					<stop offset="50%" stopColor="#06B6D4" />
					<stop offset="100%" stopColor="transparent" />
				</radialGradient>
				<radialGradient id="cpu-rose-grad" fx="1">
					<stop offset="0%" stopColor="#FF008B" />
					<stop offset="50%" stopColor="#FF008B" />
					<stop offset="100%" stopColor="transparent" />
				</radialGradient>

				{/* 3 - Circle marker drawn at the start of each trace */}
				<marker
					id="cpu-circle-marker"
					viewBox="0 0 10 10"
					refX="5"
					refY="5"
					markerWidth={lineMarkerSize}
					markerHeight={lineMarkerSize}
				>
					<circle
						id="innerMarkerCircle"
						cx="5"
						cy="5"
						r="2"
						fill="black"
						stroke="#232323"
						strokeWidth="0.5"
					>
						{animateMarkers && (
							<animate attributeName="r" values="0; 3; 2" dur="0.5s" />
						)}
					</circle>
				</marker>

				{/* 4 - Animated three-stop gradient that fills the wordmark */}
				<linearGradient id="cpu-text-gradient" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stopColor="#FF9A4D">
						{animateText && (
							<animate
								attributeName="offset"
								values="-1; 1"
								dur="3s"
								repeatCount="indefinite"
							/>
						)}
					</stop>
					<stop offset="25%" stopColor="#FFFFFF">
						{animateText && (
							<animate
								attributeName="offset"
								values="-0.75; 1.25"
								dur="3s"
								repeatCount="indefinite"
							/>
						)}
					</stop>
					<stop offset="50%" stopColor="#F0792A">
						{animateText && (
							<animate
								attributeName="offset"
								values="-0.5; 1.5"
								dur="3s"
								repeatCount="indefinite"
							/>
						)}
					</stop>
				</linearGradient>
			</defs>
		</svg>
	);
}

export { CpuArchitecture };
