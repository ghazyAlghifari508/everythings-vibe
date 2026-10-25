import { TAU } from "./orb-geometry";
import type { Look } from "./orb-types";

export const PERIOD: Record<Look, number> = {
	base: 6500,
	working: 3000,
	"working-gyro": 3000,
	reasoning: 6500,
	"reasoning-twins": 6500,
	searching: 13000,
	"searching-lighthouse": 13000,
	background: 13000,
	"background-spiral": 13000,
	retrying: 13000,
	"retrying-surge": 13000,
	compacting: 10000,
	"compacting-squeeze": 10000,
	"compacting-fuse": 10000,
	waiting: 13000,
};

export const HOP = 220;
export const TAIL = 5;
export const REACH = 24;
export const WALK = 16;

export const clocks = new Map<string, { t: number; last: number }>();

export function tick(look: string, now: number, speed: number) {
	let c = clocks.get(look);
	if (!c) {
		c = { t: 0, last: now };
		clocks.set(look, c);
	}
	if (now > c.last) {
		c.t += Math.min(now - c.last, 100) * speed;
		c.last = now;
	}
	return c.t;
}

export const spring = (x: number) =>
	1 - Math.exp(-4.5 * x) * Math.cos(3 * Math.PI * x) - x * Math.exp(-4.5);

export function rewind(t: number, w: number) {
	const P = 3200;
	const k = Math.floor(t / P);
	const u = t - k * P;
	const back = 0.6 * 2100 * w;
	const fwd = (2000 + 100 + 100) * w;
	let a: number;
	if (u < 2000) a = u * w;
	else if (u < 2200) {
		const x = (u - 2000) / 200;
		a = (2000 + 200 * (x - (x * x) / 2)) * w;
	} else if (u < 3000) a = 2100 * w - back * spring((u - 2200) / 800);
	else {
		const x = (u - 3000) / 200;
		a = 2100 * w - back + 100 * x * x * w;
	}
	return k * (fwd - back) + a;
}

export function yawOf(state: Look, t: number) {
	if (state === "retrying") return rewind(2 * t, TAU / 9000);
	if (state === "retrying-surge") {
		const turns = t / 3250;
		const u = turns - Math.floor(turns);
		return (Math.floor(turns) + (1 - (1 - u) ** 3)) * TAU;
	}
	return (t / PERIOD[state]) * TAU;
}
