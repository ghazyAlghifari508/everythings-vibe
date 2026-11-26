"use client";

import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import {
	ComputerIcon,
	InformationCircleIcon,
	Moon02Icon,
	SmartPhone01Icon,
	Sun03Icon,
	Tablet01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import type {
	DesignThemeKey,
	DesignThemeNotice,
	DesignViewportOption,
} from "../utils/design-view-contexts";

// Measured-context controls for the DESIGN.md viewer. Both panes are driven by
// the same selection, which the parent resolves once from the capture model.

export const CONTROL_CLASS =
	"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-semibold text-fog outline-none transition-colors hover:text-mist focus-visible:ring-2 focus-visible:ring-indigo data-[selected=true]:bg-charcoal data-[selected=true]:text-snow";

const VIEWPORT_ICONS: Record<string, IconSvgElement> = {
	desktop: ComputerIcon,
	tablet: Tablet01Icon,
	mobile: SmartPhone01Icon,
};

export interface DesignMdViewControlsProps {
	/** Measured viewport contexts. Fewer than two means no switcher. */
	viewports: DesignViewportOption[];
	viewport: string | null;
	onViewportChange?: (key: string) => void;
	/** Observed themes. Both must be verified before the switcher appears. */
	themes: DesignThemeKey[];
	theme: DesignThemeKey | null;
	onThemeChange?: (theme: DesignThemeKey) => void;
	/** The tabpanel id the theme tabs describe. */
	controls: string;
	idPrefix: string;
}

export function DesignMdViewControls({
	viewports,
	viewport,
	onViewportChange,
	themes,
	theme,
	onThemeChange,
	controls,
	idPrefix,
}: DesignMdViewControlsProps) {
	const lightTabRef = useRef<HTMLButtonElement>(null);
	const darkTabRef = useRef<HTMLButtonElement>(null);
	const hasThemeSwitcher = themes.includes("light") && themes.includes("dark");
	const activeTheme = hasThemeSwitcher ? (theme ?? "light") : null;
	if (viewports.length < 2 && !hasThemeSwitcher) return null;

	function themeTab(tab: DesignThemeKey, label: string) {
		const selected = activeTheme === tab;
		const otherRef = tab === "light" ? darkTabRef : lightTabRef;
		return (
			<button
				key={tab}
				ref={tab === "light" ? lightTabRef : darkTabRef}
				id={`${idPrefix}-${tab}-tab`}
				type="button"
				role="tab"
				aria-selected={selected}
				aria-controls={controls}
				tabIndex={selected ? 0 : -1}
				onKeyDown={(event) => {
					if (["ArrowRight", "ArrowLeft"].includes(event.key)) {
						event.preventDefault();
						onThemeChange?.(tab === "light" ? "dark" : "light");
						otherRef.current?.focus();
					}
				}}
				onClick={() => onThemeChange?.(tab)}
				className={`${CONTROL_CLASS} ${selected ? "bg-charcoal text-snow" : ""}`}
			>
				<Icon
					icon={tab === "light" ? Sun03Icon : Moon02Icon}
					size={15}
					aria-hidden
				/>
				<span>{label}</span>
			</button>
		);
	}

	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			{viewports.length > 1 ? (
				<ToggleButtonGroup
					aria-label="Konteks viewport DESIGN.md"
					selectionMode="single"
					disallowEmptySelection
					selectedKeys={viewport ? [viewport] : []}
					onSelectionChange={(keys) => {
						const [next] = [...keys];
						if (typeof next === "string") onViewportChange?.(next);
					}}
					className="flex gap-1 rounded-lg border border-graphite bg-onyx p-1"
				>
					{viewports.map((option) => (
						<ToggleButton
							key={option.key}
							id={option.key}
							className={CONTROL_CLASS}
						>
							<Icon
								icon={VIEWPORT_ICONS[option.key] ?? ComputerIcon}
								size={15}
								aria-hidden
							/>
							<span>{option.label}</span>
						</ToggleButton>
					))}
				</ToggleButtonGroup>
			) : null}
			{/* The theme switcher filters the view only: the canonical document,
			    its copy action and its download keep both themes. */}
			{hasThemeSwitcher ? (
				<div
					role="tablist"
					aria-label="Tema DESIGN.md"
					className="flex gap-1 rounded-lg border border-graphite bg-onyx p-1"
				>
					{themeTab("light", "Light")}
					{themeTab("dark", "Dark")}
				</div>
			) : null}
		</div>
	);
}

// Availability of the appearance the run asked for, stated directly under the
// context controls so an unavailable theme is explained where it is chosen
// instead of only in the document limitations. Several states stay distinct:
// never requested (nothing shown), verified (nothing shown), requested but not
// verified, and a result that carries no capture at all.
export function DesignMdThemeNotice({
	notice,
}: {
	notice?: DesignThemeNotice | null;
}) {
	if (!notice) return null;
	return (
		<div className="border-b border-graphite px-3 py-2">
			{/* The status text stays a live region without adding a heading level to
			    the panel's heading order. */}
			<Alert variant="subtle" role="status" className="p-3 text-xs">
				<Icon icon={InformationCircleIcon} size={16} aria-hidden />
				<span className="block font-semibold text-snow">{notice.title}</span>
				<span className="mt-0.5 block leading-5 text-fog">{notice.detail}</span>
			</Alert>
		</div>
	);
}
