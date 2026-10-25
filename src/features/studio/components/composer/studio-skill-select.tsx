"use client";

import {
	EraserIcon,
	FrameIcon,
	Layers01Icon,
	Tick01Icon,
	UnavailableIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import {
	STUDIO_DESIGN_SKILLS,
	type StudioDesignSkillAsset,
	type StudioDesignSkillIcon,
} from "@/features/studio/services/studio-design-skills";
import type { StudioDesignSkillId } from "@/features/studio/services/studio-generation-options";

// Fallback marks for skills without an official, licensable logo asset. These
// are deliberately distinct so each skill is visually identifiable; none of
// them claims to be a brand mark. See docs/studio-p2-component-discovery.md.
const FALLBACK_ICONS: Record<StudioDesignSkillIcon, IconSvgElement> = {
	none: UnavailableIcon,
	"frontend-design": FrameIcon,
	"ui-ux-pro-max": Layers01Icon,
	"anti-slop": EraserIcon,
};

// One consistent asset slot shared by every skill. Images and icons both render
// inside the same sized box so the menu stays visually regular.
function SkillAssetMark({ asset }: { asset: StudioDesignSkillAsset }) {
	if (asset.kind === "image") {
		return (
			<span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md">
				<img
					src={asset.src}
					alt={asset.alt}
					className="size-5 object-contain"
					loading="lazy"
					decoding="async"
				/>
			</span>
		);
	}
	const icon = FALLBACK_ICONS[asset.icon];
	return (
		<span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-graphite bg-onyx text-mist">
			<Icon icon={icon} size={13} />
		</span>
	);
}

// Single-select skill menu. Exactly one skill is active at a time and the
// selection is a stable id the server validates against an allowlist, never a
// display label.
export function StudioSkillSelect({
	value,
	onChange,
	disabled = false,
}: {
	value: StudioDesignSkillId;
	onChange: (skillId: StudioDesignSkillId) => void;
	disabled?: boolean;
}) {
	const [activeSkillId, setActiveSkillId] =
		useState<StudioDesignSkillId | null>(null);

	const selectedSkill =
		STUDIO_DESIGN_SKILLS.find((skill) => skill.id === value) ??
		STUDIO_DESIGN_SKILLS[0];

	const previewSkill =
		STUDIO_DESIGN_SKILLS.find((skill) => skill.id === activeSkillId) ??
		selectedSkill;

	return (
		<DropdownMenu
			onOpenChange={(open) => {
				if (!open) setActiveSkillId(null);
			}}
		>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label={`Design skill: ${selectedSkill.label}`}
					title="Pilih design skill"
					className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-graphite bg-onyx px-2.5 py-1.5 text-xs font-semibold text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50"
				>
					<SkillAssetMark asset={selectedSkill.asset} />
					<span className="max-w-28 truncate">{selectedSkill.label}</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				sideOffset={6}
				className="w-80 overflow-hidden p-0"
			>
				<div className="p-1.5 pb-0">
					<DropdownMenuLabel className="px-2.5">Design Skill</DropdownMenuLabel>
					<DropdownMenuSeparator />
				</div>
				<div
					className="max-h-64 overflow-y-auto p-1.5"
					onPointerLeave={() => setActiveSkillId(null)}
				>
					{STUDIO_DESIGN_SKILLS.map((skill) => {
						const selected = skill.id === value;
						return (
							<DropdownMenuItem
								key={skill.id}
								role="menuitemradio"
								aria-checked={selected}
								aria-describedby="skill-description-tooltip"
								title={skill.description}
								onSelect={() => onChange(skill.id)}
								onPointerEnter={() => setActiveSkillId(skill.id)}
								onFocus={() => setActiveSkillId(skill.id)}
								className={`items-start gap-2.5 px-2.5 py-2 ${
									selected
										? "bg-white/5 text-snow"
										: "text-mist focus:text-snow"
								}`}
							>
								<span className="mt-0.5">
									<SkillAssetMark asset={skill.asset} />
								</span>
								<span className="min-w-0 flex-1">
									<span className="flex items-center gap-1.5">
										<span className="truncate text-sm font-medium text-snow">
											{skill.label}
										</span>
										{skill.id === "none" ? (
											<span className="text-[10px] uppercase tracking-wider text-fog">
												Default
											</span>
										) : null}
									</span>
									<span
										id={`skill-desc-${skill.id}`}
										className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-fog"
									>
										{skill.description}
									</span>
								</span>
								<span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
									{selected ? (
										<Icon
											icon={Tick01Icon}
											size={14}
											aria-label="Terpilih"
											className="text-snow"
										/>
									) : null}
								</span>
							</DropdownMenuItem>
						);
					})}
				</div>
				{/* ponytail: accessible tooltip card pinned to menu bounds instead of floating portal to prevent viewport overflow; upgrade to Popper portal if freeform floating needed */}
				<div
					role="tooltip"
					id="skill-description-tooltip"
					aria-live="polite"
					className="border-t border-graphite bg-charcoal/80 px-3 py-2 text-xs backdrop-blur-sm"
				>
					<div className="flex items-center gap-1.5">
						<SkillAssetMark asset={previewSkill.asset} />
						<span className="font-medium text-snow">{previewSkill.label}</span>
						{previewSkill.id === "none" ? (
							<span className="text-[10px] uppercase tracking-wider text-fog">
								Default
							</span>
						) : null}
					</div>
					<p className="mt-1 leading-relaxed text-fog">
						{previewSkill.description}
					</p>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
