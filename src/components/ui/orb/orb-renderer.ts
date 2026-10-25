import { HOP, PERIOD, REACH, TAIL, tick, WALK, yawOf } from "./orb-animation";
import {
	dist2,
	distribute,
	ease,
	hash,
	LEAN,
	LENS,
	lensAt,
	nearest,
	RING_AXIS,
	TAU,
	TRAIL,
	TWIST,
} from "./orb-geometry";
import {
	type Look,
	type OrbOptions,
	type OrbRender,
	type OrbState,
	VARIANTS,
} from "./orb-types";

export const DOTS: OrbRender = {
	mount: ({ make, pts }) => {
		const els = pts.map(() => make("circle"));
		const hidden = new Uint8Array(pts.length);
		return {
			dot(i, x, y, r, a) {
				const el = els[i];
				if (!el) return;
				const o = a.toFixed(2);
				if (o === "0.00" && hidden[i]) return;
				hidden[i] = +(o === "0.00");
				el.setAttribute("cx", x.toFixed(2));
				el.setAttribute("cy", y.toFixed(2));
				el.setAttribute("r", Math.max(0.45, r).toFixed(2));
				el.setAttribute("fill-opacity", o);
			},
		};
	},
};

export function mountOrb(
	svg: SVGSVGElement,
	{
		state: asked,
		variant,
		size = 20,
		speed = 1,
		label,
		shape,
		render = DOTS,
		density = 1,
		dotSize = 1,
		tilt = 20,
	}: OrbOptions = {},
) {
	if (typeof window === "undefined" || !svg) {
		return { pause: () => {}, play: () => {}, destroy: () => {} };
	}

	const which: OrbState =
		asked && Object.hasOwn(VARIANTS, asked) ? asked : "base";
	const own =
		variant !== "default" &&
		(VARIANTS[which] as readonly string[]).includes(variant ?? "");
	const state = (own ? `${which}-${variant}` : which) as Look;
	const attrs = {
		width: size,
		height: size,
		viewBox: `0 0 ${size} ${size}`,
		fill: "currentColor",
	};
	for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, String(v));
	if (label) {
		svg.setAttribute("role", "img");
		svg.setAttribute("aria-label", label);
		svg.removeAttribute("aria-hidden");
	} else {
		svg.setAttribute("aria-hidden", "true");
		svg.removeAttribute("role");
		svg.removeAttribute("aria-label");
	}

	const dens = state === "background" ? 1 : 4;
	const count = Math.max(8, Math.round(size * dens * density));
	const form = typeof shape === "function" ? { points: shape } : shape;
	const c = size / 2;
	const R = c * 0.8 * (form?.scale ?? 1);
	const rs = (size / 64) ** 0.6 * (0.72 * Math.sqrt(4 / dens)) * dotSize;
	const pts = distribute(state, count, form);
	const make = (tag: string) =>
		svg.appendChild(
			document.createElementNS("http://www.w3.org/2000/svg", tag),
		);
	const drawer = render.mount({
		make,
		pts,
		size,
		radius: rs,
	});
	const flat = Boolean(render.flat);
	const reasoning =
		(state === "reasoning" || state === "reasoning-twins") && pts.length > 1;
	const compacting = state === "compacting" || state === "compacting-fuse";
	const near = reasoning ? pts.map((_, i) => nearest(pts, i, REACH)) : [];
	const walks: number[][] = Array.from(
		{ length: state === "reasoning-twins" ? 2 : 1 },
		() => [],
	);
	let hops = 0;

	const draw = (t: number) => {
		const period = PERIOD[state];
		const yaw = yawOf(state, t);
		const gyro = state === "working-gyro" ? (t / 5000) * TAU : null;
		const pitch =
			(((flat ? 0 : tilt) +
				(form?.tip ?? 0) +
				(gyro === null ? 0 : 10 * Math.cos(gyro))) *
				Math.PI) /
			180;
		const roll = gyro === null ? 0 : (12 * Math.sin(gyro) * Math.PI) / 180;
		const sr = Math.sin(roll);
		const cr = Math.cos(roll);
		const sy = Math.sin(yaw);
		const cy = Math.cos(yaw);
		const st = Math.sin(pitch);
		const ct = Math.cos(pitch);

		const facing = (k: number) =>
			pts[k][1] * st + (-pts[k][0] * sy + pts[k][2] * cy) * ct;
		const lit = new Map<number, number>();
		if (reasoning) {
			const s = t / HOP;
			const n = Math.floor(s);
			const f = s - n;
			if (!walks[0].length) {
				const first = [...pts.keys()].reduce(
					(b, k) => (facing(k) > facing(b) ? k : b),
					0,
				);
				const apart = (k: number) => facing(k) + dist2(pts[k], pts[first]);
				walks.forEach((walk, w) => {
					walk.push(
						w
							? [...pts.keys()].reduce(
									(b, k) => (apart(k) > apart(b) ? k : b),
									0,
								)
							: first,
					);
				});
			}
			hops = Math.max(hops, n - WALK);
			for (; hops < n; hops++) {
				walks.forEach((walk, w) => {
					const recent = walk.slice(-8);
					const from = walk[walk.length - 1];
					let best = -1;
					let score = -Infinity;
					const other =
						state === "reasoning-twins" ? walks[1 - w].at(-1) : undefined;
					near[from]?.forEach((k, j) => {
						const apart =
							other === undefined
								? 0
								: 1.2 * Math.min(Math.sqrt(dist2(pts[k], pts[other])), 0.8);
						const sc = facing(k) + 0.35 * hash(hops * 31 + j + w * 977) + apart;
						if (!recent.includes(k) && sc > score) {
							score = sc;
							best = k;
						}
					});
					walk.push(best < 0 ? (near[from]?.[0] ?? from) : best);
					if (walk.length > WALK) walk.shift();
				});
			}
			const light = (k: number | undefined, v: number) =>
				k !== undefined && lit.set(k, Math.max(lit.get(k) ?? 0, v));
			for (const walk of walks)
				for (let j = TAIL - 1; j >= 0; j--)
					light(
						walk[walk.length - 1 - j],
						j === 0 ? ease(Math.min(1, f * 2)) : 1 - (j - 1 + f) / TAIL,
					);
		}

		const head = (t / 2000) * TAU + yaw;
		const ahead = TAU / 2000 + TAU / period;
		const headLat = (tt: number) =>
			((70 * Math.PI) / 180) * (1 - 2 * ((tt % 6000) / 6000));
		const glow = Math.min(1, 3 * Math.sin(Math.PI * ((t % 6000) / 6000)));
		const lens = state === "searching" ? lensAt(t) : null;
		const tw =
			state === "working-gyro"
				? 0.5 * Math.sin((t / 2600) * TAU)
				: state === "compacting-squeeze"
					? Math.sin((t / 2600) * TAU)
					: 0;

		let sweep: { at: number; hold: number } | null = null;
		if (compacting) {
			const u = (t % 2800) / 2800;
			const s = (u - 0.7) / 0.3;
			const release =
				state === "compacting-fuse"
					? (1 - s) ** 3
					: s < 0.45
						? 1 - 1.25 * ease(s / 0.45)
						: s < 0.7
							? -0.25 * (1 - (s - 0.45) / 0.25) ** 2
							: 0;
			sweep = {
				at: -1.15 + 2.3 * Math.min(1, u / 0.7),
				hold: u < 0.7 ? 1 : release,
			};
		}

		pts.forEach(([x, y, z], i) => {
			const turn = yaw + TWIST * tw * y;
			const [ly, lc] = tw ? [Math.sin(turn), Math.cos(turn)] : [sy, cy];
			const z1 = -x * ly + z * lc;
			let vx = x * lc + z * ly;
			let vy = y * ct - z1 * st;
			const sx = z1;
			const sy2 = vx * st;
			const vz = y * st + z1 * ct;
			const d = (vz + 1) / 2;
			let r = (0.5 + 1.4 * d) * rs;
			let a = Math.max(0, (d - 0.3) / 0.7);

			if (lens) {
				const ang = Math.acos(
					Math.min(
						1,
						(vx * lens[0] + vy * lens[1] + vz * lens[2]) /
							(Math.hypot(vx, vy, vz) || 1),
					),
				);
				const w = ang < LENS ? (1 - (ang / LENS) ** 2) ** 2 : 0;
				a *= 1 - 0.55 * (1 - w);
				if (size <= 24) r *= 1 + 0.5 * w;
				if (w) {
					vx *= 1 + 0.12 * w;
					vy *= 1 + 0.12 * w;
					vx += (vx - lens[0]) * 0.35 * w;
					vy += (vy - lens[1]) * 0.35 * w;
					r *= 1 + 0.9 * w;
					a += (1 - a) * w;
				}
			}
			if (sweep) {
				const q = vx;
				const w = Math.min(1, Math.max(0, (sweep.at - q) / 0.2)) * sweep.hold;
				const k = state === "compacting" ? 1.5 : 1;
				vx *= 1 - 0.2 * k * w;
				vy *= 1 - 0.2 * k * w;
				r *= 1 - 0.3 * k * w;
				if (state === "compacting-fuse") {
					a *= 1 - 0.5 * w;
					const g =
						Math.exp(-(((q - sweep.at) / 0.08) ** 2)) *
						Math.max(0, sweep.hold) *
						Math.min(1, d / 0.5);
					r *= 1 + 0.8 * g;
					a += (1 - a) * g;
				}
			}
			if (state === "working") {
				const u = t % 1700;
				const at = 1.3 - 2.6 * ease(Math.min(1, u / 1200));
				const q = flat
					? vy
					: vx * RING_AXIS[0] + vy * RING_AXIS[1] + vz * RING_AXIS[2];
				const g = u < 1200 ? Math.exp(-(((q - at) / 0.2) ** 2)) : 0;
				r *= 1 + 0.6 * g;
				a += (1 - a) * g;
				const w =
					u < 1200
						? Math.min(1, Math.max(0, (q - at) / 0.2))
						: 1 - Math.min(1, 1.6 * ((u - 1200) / 800));
				vx *= 1 - 0.08 * w;
				vy *= 1 - 0.08 * w;
				r *= 1 - 0.15 * w;
			}
			if (state === "searching-lighthouse") {
				a *= 0.5;
				const lr = Math.sin(LEAN);
				const lc = Math.cos(LEAN);
				const across = vx * lc - vy * lr;
				const toward = -st * (vx * lr + vy * lc) + ct * vz;
				const off =
					Math.atan2(across, toward) - (((t / 2500) % 1) * TAU - Math.PI);
				const dphi = ((((off + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
				const beam =
					dphi < 0
						? Math.max(0, 1 + dphi / TRAIL)
						: Math.exp(-((dphi / 0.45) ** 2));
				const g =
					beam * (0.25 + 0.75 * Math.min(1, Math.max(0, (d - 0.4) / 0.3)));
				r *= 1 + 0.6 * g;
				a += (1 - a) * g;
			}
			if (reasoning) {
				const spark = lit.get(i) ?? 0;
				a *= 0.5;
				if (spark) {
					r *= 1 + 0.8 * spark;
					a += (1 - a) * spark;
				}
			}
			if (state === "waiting") {
				const lat = Math.asin(y / (Math.hypot(x, y, z) || 1));
				const lon = Math.atan2(z, x);
				const off = Math.atan2(Math.sin(lon - head), Math.cos(lon - head));
				const along = off * Math.cos(lat);
				const g =
					Math.exp(-(((lat - headLat(t + off / ahead)) / 0.28) ** 2)) *
					Math.exp(-((along / (off * ahead > 0 ? 0.12 : 1)) ** 2));
				const w = glow * g ** 0.6;
				a = a * 0.5 + (1 - a * 0.5) * w;
				r *= 1 + 1.1 * w;
			}
			if (roll) [vx, vy] = [vx * cr - vy * sr, vx * sr + vy * cr];
			drawer.dot(i, c + vx * R, c - vy * R, r, a, sx, -sy2);
		});
		drawer.frame?.();
	};

	const look = `${state}@${speed}`;
	draw(tick(look, performance.now(), speed));
	const still =
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	let visible = true;
	let raf = 0;
	let dead = false;
	let io: IntersectionObserver | null = null;
	if (typeof IntersectionObserver !== "undefined") {
		io = new IntersectionObserver((es) => {
			visible = es[es.length - 1]?.isIntersecting ?? true;
		});
		io.observe(svg);
	}

	function frame(now: number) {
		const t = tick(look, now, speed);
		if (visible) draw(t);
		raf = requestAnimationFrame(frame);
	}

	const pause = () => {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	};
	const play = () => {
		if (
			!raf &&
			!still &&
			!dead &&
			typeof requestAnimationFrame === "function"
		) {
			raf = requestAnimationFrame(frame);
		}
	};
	play();
	return {
		pause,
		play,
		destroy() {
			dead = true;
			pause();
			io?.disconnect();
			svg.replaceChildren?.();
		},
	};
}
