import { Check, FileCode2, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
	getStudioPresetDesignMd,
	STUDIO_DESIGN_PRESETS,
} from "@/lib/studio-presets";
import {
	type AttachedDesignReference,
	StartWithDesignModal,
} from "./start-with-design-modal";

/**
 * Design-system selection lives in the project menu rather than the composer.
 * It renders DropdownMenu items, so it must be mounted inside a
 * DropdownMenuContent.
 */
export function StudioDesignPicker({
	designMd,
	disabled,
	onApply,
}: {
	designMd: string | null;
	disabled: boolean;
	onApply: (reference: AttachedDesignReference) => Promise<boolean>;
}) {
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const reference = useMemo(
		() => ({ designMd: designMd ?? "", logo: null }),
		[designMd],
	);
	async function apply(next: {
		designMd: string;
		logo?: AttachedDesignReference["logo"];
	}) {
		if (pending) return false;
		setPending(true);
		setError("");
		try {
			return await onApply({
				designMd: next.designMd,
				logo: next.logo ?? null,
			});
		} catch (failure) {
			setError(
				failure instanceof Error ? failure.message : "Gagal menerapkan desain.",
			);
			return false;
		} finally {
			setPending(false);
		}
	}
	return (
		<>
			<DropdownMenuSub>
				<DropdownMenuSubTrigger
					className="gap-2 focus:bg-steel"
					disabled={disabled || pending}
				>
					{pending ? (
						<Loader2 size={16} className="motion-safe:animate-spin" />
					) : (
						<FileCode2 size={16} />
					)}
					Design system
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent className="w-72 max-w-[calc(100vw-24px)]">
					<DropdownMenuItem
						className="gap-2 focus:bg-steel"
						onSelect={() => setOpen(true)}
					>
						<FileCode2 size={16} />
						Start with your design
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuLabel>System Presets</DropdownMenuLabel>
					{STUDIO_DESIGN_PRESETS.map((preset) => (
						<DropdownMenuItem
							key={preset.id}
							className="gap-3 focus:bg-steel"
							onSelect={() => {
								const md = getStudioPresetDesignMd(preset.id);
								if (md) void apply({ designMd: md });
							}}
						>
							<div
								className="flex shrink-0 overflow-hidden rounded-md border border-iron"
								aria-hidden
							>
								{preset.colors.map((color) => (
									<span
										key={color}
										style={{ backgroundColor: color }}
										className="h-8 w-3"
									/>
								))}
							</div>
							<div className="min-w-0 flex-1">
								<span className="block text-sm">{preset.name}</span>
								<span className="block text-xs text-fog">
									{preset.description}
								</span>
							</div>
							{designMd === getStudioPresetDesignMd(preset.id) ? (
								<Check size={16} aria-label="Terpilih" />
							) : null}
						</DropdownMenuItem>
					))}
				</DropdownMenuSubContent>
			</DropdownMenuSub>
			<StartWithDesignModal
				open={open}
				onOpenChange={setOpen}
				initialReference={reference}
				onApply={async (next) => {
					const accepted = await apply({
						designMd: next.designMd,
						...(next.logo ? { logo: next.logo } : {}),
					});
					if (!accepted)
						throw new Error("Referensi belum tersimpan. Coba lagi.");
				}}
			/>
			{error ? (
				<span role="alert" className="sr-only">
					{error}
				</span>
			) : null}
		</>
	);
}
