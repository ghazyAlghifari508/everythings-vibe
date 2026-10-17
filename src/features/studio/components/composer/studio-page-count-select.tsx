"use client";

import { Check, LayoutGrid } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	STUDIO_DEFAULT_PAGE_COUNT,
	STUDIO_MAX_PAGE_COUNT,
	STUDIO_MIN_PAGE_COUNT,
} from "@/lib/studio-generation-options";

const PAGE_COUNT_OPTIONS: number[] = Array.from(
	{ length: STUDIO_MAX_PAGE_COUNT - STUDIO_MIN_PAGE_COUNT + 1 },
	(_, index) => STUDIO_MIN_PAGE_COUNT + index,
);

// Initial screen count for new project planning. Valid values are integers
// 1-5 and the server revalidates the selection before planning.
export function StudioPageCountSelect({
	value,
	onChange,
	disabled = false,
}: {
	value: number;
	onChange: (count: number) => void;
	disabled?: boolean;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label={`Jumlah halaman awal: ${value}`}
					title="Pilih jumlah halaman awal"
					className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-graphite bg-onyx px-2.5 py-1.5 text-xs font-semibold text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50"
				>
					<LayoutGrid size={14} aria-hidden />
					<span>{value} halaman</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" sideOffset={6} className="w-64 p-1.5">
				<div className="px-2.5 pb-2 pt-1.5">
					<span className="block text-sm font-semibold text-snow">
						Jumlah halaman
					</span>
					<span className="mt-0.5 block text-xs text-fog">
						Tentukan layar awal proyek
					</span>
				</div>
				<DropdownMenuSeparator />
				{PAGE_COUNT_OPTIONS.map((count) => {
					const selected = count === value;
					return (
						<DropdownMenuItem
							key={count}
							role="menuitemradio"
							aria-checked={selected}
							onSelect={() => onChange(count)}
							className={`gap-2.5 px-2.5 py-2 ${
								selected ? "bg-white/5 text-snow" : "text-mist focus:text-snow"
							}`}
						>
							<span className="flex size-4 shrink-0 items-center justify-center">
								{selected ? (
									<Check
										size={14}
										aria-label="Terpilih"
										className="text-snow"
									/>
								) : null}
							</span>
							<span className="flex-1 text-sm font-medium">
								{count} halaman
							</span>
							{count === STUDIO_DEFAULT_PAGE_COUNT ? (
								<span className="rounded border border-graphite px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fog">
									Default
								</span>
							) : null}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
