import { ToggleButton, ToggleButtonGroup, Tooltip } from "@heroui/react";
import {
	ArrowLeft01Icon,
	ComputerIcon,
	Menu01Icon,
	RefreshCwIcon,
	SmartPhone01Icon,
	Tablet01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import {
	STUDIO_DEVICES,
	type StudioDevice,
} from "@/features/studio/types/studio-renderer";

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

interface StudioPrototypeTopbarProps {
	pageName: string | null;
	route: string | null;
	device: StudioDevice;
	onDeviceChange: (device: StudioDevice) => void;
	onBack: () => void;
	onRefresh: () => void;
	onOpenPages: () => void;
	pageCount: number;
}

export function StudioPrototypeTopbar({
	pageName,
	route,
	device,
	onDeviceChange,
	onBack,
	onRefresh,
	onOpenPages,
	pageCount,
}: StudioPrototypeTopbarProps) {
	return (
		<header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-graphite bg-obsidian px-3 sm:px-4">
			<div className="flex min-w-0 items-center gap-3">
				<button
					type="button"
					onClick={onBack}
					aria-label="Kembali ke kanvas desain"
					className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-fog transition-colors hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow"
				>
					<Icon icon={ArrowLeft01Icon} size={16} aria-hidden />
					<span className="hidden sm:inline">Kembali</span>
				</button>
				<div className="flex min-w-0 items-baseline gap-2">
					<span className="truncate text-sm font-[510] text-snow">
						{pageName ?? "Prototipe"}
					</span>
					{route ? (
						<span className="hidden truncate font-berkeley-mono text-xs text-fog sm:inline">
							{route}
						</span>
					) : null}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<ToggleButtonGroup
					aria-label="Ukuran perangkat"
					selectionMode="single"
					disallowEmptySelection
					selectedKeys={[device]}
					onSelectionChange={(keys) => {
						const [next] = [...keys];
						if (STUDIO_DEVICES.some((entry) => entry === next))
							onDeviceChange(next as StudioDevice);
					}}
					className="flex gap-1 rounded-lg border border-graphite bg-onyx p-1"
				>
					{STUDIO_DEVICES.map((entry) => (
						<ToggleButton
							key={entry}
							id={entry}
							aria-label={DEVICE_LABELS[entry]}
							className="inline-flex min-h-9 min-w-11 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-fog outline-none transition-colors hover:text-mist focus-visible:ring-2 focus-visible:ring-indigo data-[selected=true]:bg-steel data-[selected=true]:text-snow"
						>
							<Icon icon={DEVICE_ICONS[entry]} size={16} aria-hidden />
							<span className="hidden md:inline">{DEVICE_LABELS[entry]}</span>
						</ToggleButton>
					))}
				</ToggleButtonGroup>
				<Tooltip>
					<Tooltip.Trigger<"button">
						render={(props) => <button {...props} type="button" />}
						aria-label="Muat ulang prototipe"
						onClick={onRefresh}
						className="flex size-11 items-center justify-center rounded-md border border-transparent text-fog hover:bg-steel hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow"
					>
						<Icon icon={RefreshCwIcon} size={18} aria-hidden />
					</Tooltip.Trigger>
					<Tooltip.Content className="rounded-md border border-graphite bg-charcoal px-2 py-1 text-xs text-snow">
						Muat ulang dan atur ulang state
					</Tooltip.Content>
				</Tooltip>
				<button
					type="button"
					onClick={onOpenPages}
					aria-label={`Buka daftar halaman (${pageCount})`}
					className="flex size-11 items-center justify-center rounded-md border border-transparent text-fog hover:bg-steel hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow lg:hidden"
				>
					<Icon icon={Menu01Icon} size={18} aria-hidden />
				</button>
			</div>
		</header>
	);
}
