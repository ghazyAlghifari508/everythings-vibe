"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { AdminCreditDetail } from "../types/admin-credit";
import {
	fundingSourceLabel,
	operationLabel,
	productFamilyLabel,
} from "../utils/admin-credit-utils";

interface AdminCreditDetailDialogProps {
	detail: AdminCreditDetail | null;
	onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5 border-b border-graphite py-2 last:border-b-0">
			<span className="text-[11px] text-mist">{label}</span>
			<span className="break-words text-xs text-snow">{value}</span>
		</div>
	);
}

export function AdminCreditDetailDialog({
	detail,
	onClose,
}: AdminCreditDetailDialogProps) {
	return (
		<Dialog open={detail !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="text-base font-[510] text-snow">
						Detail operasi kredit
					</DialogTitle>
					<DialogDescription className="text-xs text-fog">
						Metadata operasi. Prompt, konten resource, dan token penyedia tidak
						ditampilkan.
					</DialogDescription>
				</DialogHeader>
				{detail && (
					<div className="mt-2">
						<DetailRow label="ID operasi" value={detail.id} />
						<DetailRow
							label="Waktu dibuat"
							value={
								detail.createdAt
									? new Date(detail.createdAt).toLocaleString("id-ID")
									: "Tidak ada data"
							}
						/>
						<DetailRow
							label="Pengguna"
							value={detail.userEmail ?? "Tidak ada data"}
						/>
						<DetailRow
							label="Fitur"
							value={productFamilyLabel(detail.product)}
						/>
						<DetailRow
							label="Aktivitas"
							value={operationLabel(detail.operation)}
						/>
						<DetailRow
							label="Resource"
							value={detail.resourceLabel ?? "Tidak ada data"}
						/>
						<DetailRow label="Tahap" value={detail.stage} />
						<DetailRow label="Status" value={detail.state} />
						<DetailRow
							label="Sumber dana"
							value={fundingSourceLabel(detail.fundingSource)}
						/>
						<DetailRow
							label="Estimasi kredit"
							value={String(detail.estimatedCredits)}
						/>
						<DetailRow
							label="Reservasi kredit"
							value={String(detail.reservedCredits)}
						/>
						<DetailRow
							label="Tagihan akhir"
							value={
								detail.finalCharge === null
									? "Belum ada tagihan"
									: String(detail.finalCharge)
							}
						/>
						<DetailRow label="Versi harga" value={detail.pricingVersion} />
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
