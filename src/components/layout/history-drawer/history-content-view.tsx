import { Link } from "@tanstack/react-router";
import { HistoryItemView } from "./history-item-view";
import type { DrawerHistoryItem, HistoryFailure } from "./history-types";

interface HistoryContentViewProps {
	staleAfterFailure: boolean;
	failed: boolean;
	failure: HistoryFailure | null;
	loading: boolean;
	visibleItems: DrawerHistoryItem[];
	emptyMessage: string;
	onClose: () => void;
	onRetry: () => void;
	isFetching: boolean;
	onSelect: (item: DrawerHistoryItem) => void;
}

export function HistoryContentView({
	staleAfterFailure,
	failed,
	failure,
	loading,
	visibleItems,
	emptyMessage,
	onClose,
	onRetry,
	isFetching,
	onSelect,
}: HistoryContentViewProps) {
	return (
		<div className="custom-scrollbar flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
			{staleAfterFailure && (
				<p className="border-b border-graphite/60 pb-2 text-[11px] leading-relaxed text-fog">
					Menampilkan data tersimpan. Pembaruan dari server gagal.
				</p>
			)}
			{failed ? (
				<div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
					{failure === "session" ? (
						<>
							<p className="text-[11px] leading-relaxed text-fog">
								Sesi kamu sudah berakhir, jadi riwayat tidak bisa dimuat. Masuk
								untuk melanjutkan.
							</p>
							<Link
								to="/login"
								onClick={onClose}
								className="rounded-md border border-graphite bg-charcoal/40 px-3 py-1.5 text-[11px] text-snow transition-colors hover:border-steel hover:bg-charcoal/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								Masuk
							</Link>
						</>
					) : failure === "blocked" ? (
						<p className="text-[11px] leading-relaxed text-fog">
							Akun kamu diblokir, jadi riwayat tidak bisa diakses. Hubungi admin
							untuk membuka akses.
						</p>
					) : (
						<>
							<p className="text-[11px] leading-relaxed text-crimson">
								Gagal memuat riwayat dari server. Coba lagi.
							</p>
							<button
								type="button"
								onClick={onRetry}
								disabled={isFetching}
								className="rounded-md border border-graphite bg-charcoal/40 px-3 py-1.5 text-[11px] text-snow transition-colors hover:border-steel hover:bg-charcoal/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-40"
							>
								{isFetching ? "Memuat..." : "Coba lagi"}
							</button>
						</>
					)}
				</div>
			) : loading ? (
				<p className="px-1 py-6 text-center text-[11px] text-fog">
					Memuat riwayat...
				</p>
			) : visibleItems.length === 0 ? (
				<p className="px-1 py-6 text-center text-[11px] leading-relaxed text-fog">
					{emptyMessage}
				</p>
			) : (
				visibleItems.map((item) => (
					<HistoryItemView key={item.id} item={item} onSelect={onSelect} />
				))
			)}
		</div>
	);
}
