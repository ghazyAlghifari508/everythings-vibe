"use client";

import { useEffect, useRef } from "react";
import {
	mountOrb,
	type OrbLook,
	type OrbOptions,
	type OrbRender,
	type OrbShape,
	type OrbState,
	type OrbVariant,
} from "./orb-core";

export type { OrbLook, OrbOptions, OrbRender, OrbShape, OrbState, OrbVariant };

/**
 * An animated status indicator for what an AI agent is doing from Thinking Orbs.
 * Tuned to read at 16-20px, draws in currentColor, respects reduced motion,
 * zero layout shift.
 */
export function Orb({
	state,
	variant,
	size = 20,
	speed = 1,
	paused = false,
	label,
	shape,
	render,
	density,
	dotSize,
	tilt,
	className,
}: OrbOptions & { paused?: boolean; className?: string }) {
	const ref = useRef<SVGSVGElement>(null);
	const orb = useRef<ReturnType<typeof mountOrb> | null>(null);

	useEffect(() => {
		if (!ref.current) return;
		const o = mountOrb(ref.current, {
			state,
			variant,
			size,
			speed,
			label,
			shape,
			render,
			density,
			dotSize,
			tilt,
		} as OrbOptions);
		orb.current = o;
		return () => o.destroy();
	}, [
		state,
		variant,
		size,
		speed,
		label,
		shape,
		render,
		density,
		dotSize,
		tilt,
	]);

	useEffect(() => {
		if (!orb.current) return;
		if (paused) orb.current.pause();
		else orb.current.play();
	}, [paused]);

	const a11y = label
		? { role: "img", "aria-label": label }
		: { "aria-hidden": true as const };

	return (
		<svg
			ref={ref}
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			fill="currentColor"
			className={className}
			{...a11y}
		/>
	);
}
