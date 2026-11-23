import type { HTMLAttributes, ReactNode } from "react";

/**
 * Tablet bezel adapted from the eldoraui `ipad` registry SVG (landscape,
 * 520x400). Rotated a quarter turn so the portrait document viewport matches
 * 768x1024; the screen area is a separate unrotated layer holding the live
 * document, so content is never rotated.
 */
const LANDSCAPE_W = 520;
const LANDSCAPE_H = 400;
const PORTRAIT_W = LANDSCAPE_H;
const PORTRAIT_H = LANDSCAPE_W;
// Landscape screen rect (31.37, 28.47, 457.25 x 342.87) after a 90deg turn.
const SCREEN_X = 28.66;
const SCREEN_Y = 31.37;
const SCREEN_W = 342.87;
const SCREEN_H = 457.25;
const pct = (value: number, total: number) => `${(value / total) * 100}%`;

export interface IpadProps extends HTMLAttributes<HTMLDivElement> {
	children?: ReactNode;
}

export function Ipad({ children, className, style, ...props }: IpadProps) {
	return (
		<div
			className={`relative inline-block w-full align-middle leading-none ${className ?? ""}`}
			style={{ aspectRatio: `${PORTRAIT_W}/${PORTRAIT_H}`, ...style }}
			{...props}
		>
			<div
				className="absolute z-0 overflow-hidden bg-white"
				style={{
					left: pct(SCREEN_X, PORTRAIT_W),
					top: pct(SCREEN_Y, PORTRAIT_H),
					width: pct(SCREEN_W, PORTRAIT_W),
					height: pct(SCREEN_H, PORTRAIT_H),
					borderRadius: "2.4% / 1.8%",
				}}
			>
				{children}
			</div>
			<div
				aria-hidden
				className="pointer-events-none absolute z-10"
				style={{
					width: pct(PORTRAIT_H, PORTRAIT_W),
					height: pct(PORTRAIT_W, PORTRAIT_H),
					left: pct(-(PORTRAIT_H - PORTRAIT_W) / 2, PORTRAIT_W),
					top: pct((PORTRAIT_H - PORTRAIT_W) / 2, PORTRAIT_H),
					transform: "rotate(90deg)",
				}}
			>
				<svg
					aria-hidden="true"
					role="presentation"
					viewBox={`0 0 ${LANDSCAPE_W} ${LANDSCAPE_H}`}
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					className="size-full"
				>
					<defs>
						<mask id="ipadScreenPunch" maskUnits="userSpaceOnUse">
							<rect
								x="0"
								y="0"
								width={LANDSCAPE_W}
								height={LANDSCAPE_H}
								fill="white"
							/>
							<rect
								x="31.37"
								y="28.47"
								width="457.25"
								height="342.87"
								rx="9.61"
								ry="9.61"
								fill="black"
							/>
						</mask>
					</defs>
					<g mask="url(#ipadScreenPunch)">
						<path
							fill="#aaabac"
							d="M479.04,14.14H88.14v-.59c0-.16-.13-.3-.3-.3h-16.7c-.16,0-.3.13-.3.3v.59h-3.46v-.59c0-.16-.13-.3-.3-.3h-16.7c-.16,0-.3.13-.3.3v.59h-9.13c-13.4,0-24.27,10.78-24.45,24.14h-.48c-.16,0-.3.13-.3.3v20.07c0,.16.13.3.3.3h.47v303.38c0,13.51,10.95,24.45,24.45,24.45h438.08c13.51,0,24.45-10.95,24.45-24.45V38.6c0-13.51-10.95-24.45-24.45-24.45Z"
						/>
						<rect
							fill="#000"
							x="18.58"
							y="15.94"
							width="482.84"
							height="368.91"
							rx="23.29"
							ry="23.29"
						/>
					</g>
				</svg>
			</div>
		</div>
	);
}
