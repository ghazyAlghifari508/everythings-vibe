/**
 * Selection summary plus the two destructive/cancel actions shared by History
 * surfaces. Copy is driven by `noun` so each surface names its own records
 * while the interaction stays identical.
 */
export function HistorySelectionBar({
	noun,
	count,
	filteredTotal,
	truncated,
	notice,
	deleting,
	cancelLabel = "Batal",
	deleteLabel,
	onClear,
	onDelete,
}: {
	noun: string;
	count: number;
	filteredTotal: number;
	truncated: boolean;
	notice: string | null;
	deleting: boolean;
	cancelLabel?: string;
	deleteLabel?: string;
	onClear: () => void;
	onDelete: () => void;
}) {
	return (
		<div className="flex flex-col gap-3 rounded-xl border border-graphite bg-charcoal p-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex flex-col gap-0.5">
				<p className="text-sm font-medium text-snow tabular-nums">
					{count} {noun} dipilih
				</p>
				{truncated ? (
					<p className="text-xs text-fog">
						{count} dari {filteredTotal} {noun} bisa dipilih sekaligus.
						Persempit filter untuk memilih sisanya.
					</p>
				) : null}
				{notice ? <p className="text-xs text-fog">{notice}</p> : null}
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onClear}
					disabled={deleting}
					className="inline-flex min-h-11 items-center rounded-lg border border-graphite px-3 text-xs font-medium text-snow transition-colors hover:bg-onyx disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					{cancelLabel}
				</button>
				<button
					type="button"
					onClick={onDelete}
					disabled={deleting || count === 0}
					className="inline-flex min-h-11 items-center rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					{deleteLabel ?? `Hapus ${count}`}
				</button>
			</div>
		</div>
	);
}
