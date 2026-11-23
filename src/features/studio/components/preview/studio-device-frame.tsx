import type { ReactNode } from "react";
import type { StudioDevice } from "@/features/studio/types/studio-renderer";
import type { StudioPrototypeStage } from "@/features/studio/utils/studio-prototype-stage";
import { Ipad } from "./device-ipad";
import { Iphone } from "./device-iphone";
import { Safari } from "./device-safari";

interface StudioDeviceFrameProps {
	device: StudioDevice;
	stage: StudioPrototypeStage;
	/** Address shown as read-only presentation text on the desktop shell. */
	address: string;
	children: ReactNode;
}

/**
 * Presentation shell around the live document. The mockups are the adopted
 * Magic UI Safari / iPhone and eldoraui iPad SVGs: each punches a screen
 * window whose size equals the selected document viewport, so the iframe
 * inside keeps a real device-sized viewport while the whole shell scales to
 * fit. The bezels are pointer-transparent and never overlap the screen.
 */
export function StudioDeviceFrame({
	device,
	stage,
	address,
	children,
}: StudioDeviceFrameProps) {
	const { shell, scale, footprint } = stage;
	const shellProps = {
		className: "!block",
		style: { width: shell.width, height: shell.height },
	};
	return (
		<div
			data-testid="studio-device-frame"
			data-device={device}
			className="shrink-0"
			style={{ width: footprint.width, height: footprint.height }}
		>
			<div
				style={{
					width: shell.width,
					height: shell.height,
					transform: `scale(${scale})`,
					transformOrigin: "0 0",
				}}
			>
				{device === "desktop" ? (
					<Safari {...shellProps} url={address} mode="simple">
						{children}
					</Safari>
				) : device === "tablet" ? (
					<Ipad {...shellProps}>{children}</Ipad>
				) : (
					<Iphone {...shellProps}>{children}</Iphone>
				)}
			</div>
		</div>
	);
}
