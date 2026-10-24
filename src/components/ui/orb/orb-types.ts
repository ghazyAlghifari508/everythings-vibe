/** One state per thing an agent does, and the looks each comes in, `default` first. */
export const VARIANTS = {
	base: ["default"],
	working: ["default", "gyro"],
	reasoning: ["default", "twins"],
	searching: ["default", "lighthouse"],
	background: ["default", "spiral"],
	retrying: ["default", "surge"],
	compacting: ["default", "squeeze", "fuse"],
	waiting: ["default"],
} as const;

export type OrbState = keyof typeof VARIANTS;
export type OrbVariant<S extends OrbState = OrbState> =
	(typeof VARIANTS)[S][number];

/** A state and one of its own variants, `default` if left out. With no state it's `base`. */
export type OrbLook =
	| { state?: undefined; variant?: undefined }
	| {
			[S in OrbState]: { state: S; variant?: OrbVariant<S> };
	  }[OrbState];

/** What the drawing keys on: the state alone for its default look, or state-variant. */
export type Look =
	| OrbState
	| {
			[S in OrbState]: `${S}-${Exclude<OrbVariant<S>, "default">}`;
	  }[OrbState];

export type OrbShape = {
	points: (count: number, look: string) => number[][];
	scale?: number;
	tip?: number;
};

export type OrbRender = {
	mount: (orb: {
		make: (tag: string) => SVGElement;
		pts: number[][];
		size: number;
		radius: number;
	}) => {
		dot: (
			i: number,
			x: number,
			y: number,
			r: number,
			a: number,
			dx: number,
			dy: number,
		) => void;
		frame?: () => void;
	};
	flat?: boolean;
};

export type OrbOptions = OrbLook & {
	size?: number;
	speed?: number;
	label?: string;
	shape?: OrbShape | OrbShape["points"];
	render?: OrbRender;
	density?: number;
	dotSize?: number;
	tilt?: number;
};
