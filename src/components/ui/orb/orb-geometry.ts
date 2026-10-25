import type { Look, OrbShape } from "./orb-types";

export const TAU = Math.PI * 2;
export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export const ease = (x: number) => (1 - Math.cos(Math.PI * x)) / 2;

export const hash = (n: number) => {
	const s = Math.sin(n * 127.1) * 43758.5453;
	return s - Math.floor(s);
};

export const dist2 = (a: number[], b: number[]) =>
	(a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export const nearest = (pts: number[][], i: number, k: number) => {
	const idx: number[] = [];
	const d: number[] = [];
	const p = pts[i];
	for (let j = 0; j < pts.length; j++) {
		if (j === i) continue;
		const e = dist2(p, pts[j]);
		let at = idx.length;
		if (at === k) {
			if (e >= d[k - 1]) continue;
			at--;
		}
		while (at > 0 && d[at - 1] > e) {
			idx[at] = idx[at - 1];
			d[at] = d[at - 1];
			at--;
		}
		idx[at] = j;
		d[at] = e;
	}
	return idx;
};

export const RING_AXIS = (() => {
	const tip = (30 * Math.PI) / 180;
	const roll = (10 * Math.PI) / 180;
	return [
		-Math.sin(roll) * Math.cos(tip),
		Math.cos(roll) * Math.cos(tip),
		Math.sin(tip),
	];
})();

export const TWIST = 1.4;
export const LEAN = (30 * Math.PI) / 180;
export const TRAIL = Math.PI / 2;

export const LENS_MS = 1800;
export const MOVE = 0.4;
export const LENS = 0.6;

export function spot(k: number) {
	const phi = k * 2.45 + hash(k) * 1.5;
	const theta = ((15 + 30 * hash(k + 0.5)) * Math.PI) / 180;
	return [
		Math.sin(theta) * Math.cos(phi),
		Math.sin(theta) * Math.sin(phi),
		Math.cos(theta),
	];
}

export function lensAt(t: number) {
	const k = Math.floor(t / LENS_MS);
	const u = t / LENS_MS - k;
	const e = u < MOVE ? (1 - Math.cos((u / MOVE) * Math.PI)) / 2 : 1;
	const a = spot(k);
	const b = spot(k + 1);
	const v = a.map((ai, j) => ai + (b[j] - ai) * e);
	const n = Math.hypot(v[0], v[1], v[2]) || 1;
	return v.map((vi) => vi / n);
}

export function arms(count: number): number[][] {
	const at = (lat: number, lon: number) => [
		Math.cos(lat) * Math.cos(lon),
		Math.sin(lat),
		Math.cos(lat) * Math.sin(lon),
	];
	const g = Math.sqrt((4 * Math.PI) / count);
	const n = 8;
	const along = 0.6 * g;
	return Array.from({ length: n }, (_, m) => {
		const room = m ? m & -m : n;
		const lim = Math.min(
			(85 * Math.PI) / 180,
			Math.acos(Math.min(1, (g * n) / (TAU * room))),
		);
		const out: number[][] = [];
		for (
			let lat = -lim + ((m * 0.618) % 1) * along;
			lat <= lim;
			lat += along / Math.sqrt(1 + Math.cos(lat) ** 2)
		)
			out.push(at(lat, (m / n) * TAU - lat));
		return out;
	}).flat();
}

export function distribute(
	state: Look,
	count: number,
	shape?: OrbShape,
): number[][] {
	if (shape) return shape.points(count, state);
	if (state === "background-spiral") return arms(count);
	return Array.from({ length: count }, (_, i) => {
		const y = 1 - (2 * (i + 0.5)) / count;
		const r = Math.sqrt(1 - y * y);
		const th = i * GOLDEN;
		return [r * Math.cos(th), y, r * Math.sin(th)];
	});
}
