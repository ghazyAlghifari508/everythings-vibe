import { Tooltip } from "@heroui/react";
import {
	CenterFocusIcon,
	ComputerIcon,
	PlayIcon,
	RefreshCwIcon,
	SmartPhone01Icon,
	Tablet01Icon,
} from "@hugeicons/core-free-icons";
import type { KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icon";
import {
	STUDIO_FRAME_TOOLBAR_BUTTON_PX,
	STUDIO_FRAME_TOOLBAR_GROUP_GAP_PX,
	STUDIO_FRAME_TOOLBAR_WIDTH_PX,
} from "@/features/studio/types/studio-constants";
import type { StudioPreviewTarget } from "@/features/studio/types/studio-preview-contract";
import {
	STUDIO_DEVICE_PRESETS,
	STUDIO_DEVICES,
	type StudioDevice,
} from "@/features/studio/types/studio-renderer";
import type { StudioFrameToolbarPlacement } from "@/features/studio/utils/studio-frame-toolbar";

const DEVICE_ICONS = {
	desktop: ComputerIcon,
	tablet: Tablet01Icon,
	mobile: SmartPhone01Icon,
} as const;

const DEVICE_LABELS: Record<StudioDevice, string> = {
	desktop: "Desktop",
	tablet: "Tablet",
	mobile: "Mobile",
};

function deviceDimensions(device: StudioDevice): string {
	const preset = STUDIO_DEVICE_PRESETS[device];
	return `${preset.width} × ${preset.height}`;
}

interface ToolbarButtonProps {
	label: string;
	tooltip: string;
	icon: typeof CenterFocusIcon;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
}

function ToolbarButton({
	label,
	tooltip,
	icon,
	active = false,
	disabled = false,
	onClick,
}: ToolbarButtonProps) {
	return (
		<Tooltip>
			<Tooltip.Trigger<"button">
				render={(props) => <button {...props} type="button" />}
				aria-label={label}
				aria-pressed={active}
				disabled={disabled}
				onClick={onClick}
				style={{
					width: STUDIO_FRAME_TOOLBAR_BUTTON_PX,
					height: STUDIO_FRAME_TOOLBAR_BUTTON_PX,
				}}
				className={`flex shrink-0 items-center justify-center rounded-md border focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-snow disabled:cursor-not-allowed disabled:opacity-40 ${
					active
						? "border-snow/50 bg-steel text-snow"
						: "border-transparent text-fog hover:bg-steel hover:text-snow"
				}`}
			>
				<Icon icon={icon} size={18} aria-hidden="true" />
			</Tooltip.Trigger>
			<Tooltip.Content className="rounded-md border border-graphite bg-charcoal px-2 py-1 text-xs text-snow">
				{tooltip}
			</Tooltip.Content>
		</Tooltip>
	);
}

export interface StudioFrameToolbarProps {
	placement: StudioFrameToolbarPlacement;
	frameName: string;
	device: StudioDevice;
	nativeDevice: StudioDevice;
	liveReady: boolean;
	previewTarget: StudioPreviewTarget;
	onDeviceChange?: (device: StudioDevice) => void;
	onFocus: () => void;
	onRefresh?: () => void;
	onPreview?: (target: StudioPreviewTarget) => void;
}

function handleToolbarKeys(event: KeyboardEvent<HTMLDivElement>) {
	if (
		!(event.target instanceof HTMLButtonElement) ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey
	)
		return;
	const { key } = event;
	if (
		key !== "ArrowUp" &&
		key !== "ArrowDown" &&
		key !== "Home" &&
		key !== "End"
	)
		return;
	const buttons = Array.from(
		event.currentTarget.querySelectorAll<HTMLButtonElement>("button:enabled"),
	);
	const index = buttons.indexOf(event.target);
	if (index < 0) return;
	event.preventDefault();
	event.stopPropagation();
	const last = buttons.length - 1;
	const next =
		key === "Home"
			? 0
			: key === "End"
				? last
				: key === "ArrowUp"
					? index === 0
						? last
						: index - 1
					: index === last
						? 0
						: index + 1;
	buttons[next]?.focus();
}

/**
 * Six icon-only actions in two logical groups. The toolbar lives in screen
 * space next to the selected frame, so canvas zoom never shrinks the controls.
 */
export function StudioFrameToolbar({
	placement,
	frameName,
	device,
	nativeDevice,
	liveReady,
	previewTarget,
	onDeviceChange,
	onFocus,
	onRefresh,
	onPreview,
}: StudioFrameToolbarProps) {
	return (
		<div
			data-testid="studio-frame-toolbar"
			data-active-device={device}
			data-placement-side={placement.side}
			aria-label={`Kontrol frame ${frameName}`}
			role="toolbar"
			aria-orientation="vertical"
			className="absolute z-30 flex touch-pan-y touch-pinch-zoom flex-col overflow-y-auto overscroll-contain rounded-lg border border-iron bg-obsidian p-1 [scrollbar-width:none]"
			style={{
				left: placement.x,
				top: placement.y,
				width: STUDIO_FRAME_TOOLBAR_WIDTH_PX,
				maxHeight: placement.maxHeight,
			}}
			onPointerDown={(event) => event.stopPropagation()}
			onKeyDown={handleToolbarKeys}
		>
			<fieldset
				aria-label="Ukuran perangkat"
				className="flex shrink-0 flex-col gap-1"
			>
				{STUDIO_DEVICES.map((entry) => {
					const needsLive = entry !== nativeDevice;
					const disabled = !onDeviceChange || (needsLive && !liveReady);
					const label = `${DEVICE_LABELS[entry]} ${deviceDimensions(entry)}`;
					return (
						<ToolbarButton
							key={entry}
							icon={DEVICE_ICONS[entry]}
							label={`${label} untuk ${frameName}`}
							tooltip={
								needsLive && !liveReady
									? "Menyiapkan tampilan langsung untuk ukuran ini."
									: label
							}
							active={device === entry}
							disabled={disabled}
							onClick={() => onDeviceChange?.(entry)}
						/>
					);
				})}
			</fieldset>
			<fieldset
				aria-label="Aksi frame"
				className="flex shrink-0 flex-col gap-1"
				style={{ marginTop: STUDIO_FRAME_TOOLBAR_GROUP_GAP_PX }}
			>
				<ToolbarButton
					icon={CenterFocusIcon}
					label={`Fokus ke ${frameName}`}
					tooltip="Fokus ke frame"
					onClick={onFocus}
				/>
				<ToolbarButton
					icon={PlayIcon}
					label={`Buka pratinjau ${frameName}`}
					tooltip={
						previewTarget.routeAvailable
							? "Buka pratinjau prototipe"
							: (previewTarget.unavailableReason ?? "Pratinjau belum tersedia.")
					}
					disabled={!previewTarget.routeAvailable || !onPreview}
					onClick={() => onPreview?.(previewTarget)}
				/>
				<ToolbarButton
					icon={RefreshCwIcon}
					label={`Muat ulang tampilan ${frameName}`}
					tooltip="Muat ulang tampilan"
					onClick={() => onRefresh?.()}
					disabled={!onRefresh}
				/>
			</fieldset>
		</div>
	);
}
