import { Loading02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";

export function ScrapeHistorySelectAll({
	pageIds,
	selectedIds,
	total,
	filteredScopeActive,
	preparing,
	onTogglePage,
	onSelectAllFiltered,
}: {
	pageIds: readonly string[];
	selectedIds: ReadonlySet<string>;
	total: number;
	filteredScopeActive: boolean;
	preparing: boolean;
	onTogglePage: (selected: boolean) => void;
	onSelectAllFiltered: () => void;
}) {
	const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
	const pageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;
	const scopeAvailable =
		pageSelected && !filteredScopeActive && total > selectedIds.size;

	return (
		<div className="flex flex-col gap-2">
			<label className="inline-flex items-center gap-2 text-xs text-fog">
				<input
					type="checkbox"
					checked={pageSelected}
					onChange={(event) => onTogglePage(event.target.checked)}
					className="size-4 shrink-0 accent-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				/>
				<span>
					{pageSelected
						? `${selectedOnPage} hasil dipilih di halaman ini.`
						: "Pilih semua di halaman ini"}
				</span>
			</label>

			{scopeAvailable ? (
				<button
					type="button"
					onClick={onSelectAllFiltered}
					disabled={preparing}
					className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg border border-graphite bg-charcoal px-3 text-xs font-medium text-snow transition-colors hover:border-fog/40 hover:text-snow disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					{preparing ? (
						<Icon
							icon={Loading02Icon}
							size={12}
							aria-hidden="true"
							className="motion-safe:animate-spin"
						/>
					) : null}
					{preparing
						? "Menyiapkan pilihan"
						: `Pilih semua ${total} hasil sesuai filter`}
				</button>
			) : null}
		</div>
	);
}
