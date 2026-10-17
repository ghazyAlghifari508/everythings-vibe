"use client";

import { X } from "lucide-react";
import type { CreditOperationItem } from "./credit-usage";

export function CreditUsageDetail({
	selectedOp,
	activityLabel,
	onClose,
}: {
	selectedOp: CreditOperationItem;
	activityLabel: string;
	onClose: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
			role="dialog"
			aria-modal="true"
			aria-labelledby="detail-modal-title"
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<button
				type="button"
				className="fixed inset-0 cursor-default bg-transparent border-none p-0 w-full h-full"
				aria-label="Tutup overlay"
				tabIndex={-1}
				onClick={onClose}
			/>
			<div className="relative z-10 w-full max-w-lg rounded-xl border border-(--border-subtle) bg-(--bg-card) p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
				<div className="flex items-center justify-between border-b border-(--border-subtle) pb-4">
					<h3
						id="detail-modal-title"
						className="font-inter text-lg font-bold text-snow"
					>
						Detail Penggunaan Kredit
					</h3>
					<button
						type="button"
						data-testid="modal-close-btn"
						onClick={onClose}
						className="rounded p-1 text-fog hover:text-snow transition-colors"
						aria-label="Tutup modal"
					>
						<X size={18} />
					</button>
				</div>

				<div className="mt-5 space-y-4 text-sm">
					<div className="grid grid-cols-2 gap-3 rounded-lg bg-(--bg-surface) p-3 text-xs">
						<div>
							<span className="text-(--text-secondary)">Aktivitas:</span>
							<p className="font-semibold text-snow mt-0.5">{activityLabel}</p>
						</div>
						<div>
							<span className="text-(--text-secondary)">Proyek:</span>
							<p className="font-semibold text-snow mt-0.5 truncate">
								{selectedOp.projectName || "Proyek Tanpa Nama"}
							</p>
						</div>
						<div>
							<span className="text-(--text-secondary)">Versi Pricing:</span>
							<p className="font-mono text-snow mt-0.5">
								{selectedOp.pricingVersion}
							</p>
						</div>
						<div>
							<span className="text-(--text-secondary)">Batas Maksimum:</span>
							<p className="mt-0.5">
								{selectedOp.capApplied ? (
									<span className="font-medium text-amber-400">
										Batas Maksimum Diterapkan
									</span>
								) : (
									<span className="text-(--text-secondary)">Tidak</span>
								)}
							</p>
						</div>
						<div>
							<span className="text-(--text-secondary)">Estimasi Awal:</span>
							<p className="font-mono text-snow mt-0.5">
								{selectedOp.estimatedCredits} kredit
							</p>
						</div>
						<div>
							<span className="text-(--text-secondary)">Batas Kuota:</span>
							<p className="font-mono text-snow mt-0.5">
								{selectedOp.maximumCredits} kredit
							</p>
						</div>
					</div>

					<div>
						<h4 className="font-inter text-xs font-semibold uppercase tracking-wider text-(--text-secondary) mb-2">
							Metrik Kompleksitas
						</h4>
						<div className="space-y-2 rounded-lg border border-(--border-subtle) p-3 text-xs">
							<div className="flex justify-between py-1 border-b border-(--border-subtle)/50">
								<span className="text-(--text-secondary)">Panjang Prompt</span>
								<span className="font-mono text-snow">
									{(selectedOp.metrics.promptChars ?? 0).toLocaleString(
										"id-ID",
									)}{" "}
									karakter
								</span>
							</div>

							{selectedOp.metrics.prdSourceChars !== undefined && (
								<div className="flex justify-between py-1 border-b border-(--border-subtle)/50">
									<span className="text-(--text-secondary)">
										Panjang PRD Sumber
									</span>
									<span className="font-mono text-snow">
										{selectedOp.metrics.prdSourceChars.toLocaleString("id-ID")}{" "}
										karakter
									</span>
								</div>
							)}

							{selectedOp.metrics.taskCount !== undefined && (
								<div className="flex justify-between py-1 border-b border-(--border-subtle)/50">
									<span className="text-(--text-secondary)">Jumlah Task</span>
									<span className="font-mono text-snow">
										{selectedOp.metrics.taskCount} task
									</span>
								</div>
							)}

							{selectedOp.metrics.codebase && (
								<>
									<div className="flex justify-between py-1 border-b border-(--border-subtle)/50">
										<span className="text-(--text-secondary)">
											File Codebase
										</span>
										<span className="font-mono text-snow">
											{selectedOp.metrics.codebase.fileCount ?? 0} file
										</span>
									</div>
									<div className="flex justify-between py-1 border-b border-(--border-subtle)/50">
										<span className="text-(--text-secondary)">
											Ukuran Codebase
										</span>
										<span className="font-mono text-snow">
											{(
												selectedOp.metrics.codebase.sourceBytes ?? 0
											).toLocaleString("id-ID")}{" "}
											bytes
										</span>
									</div>
									{selectedOp.metrics.codebase.dependencyCount !==
										undefined && (
										<div className="flex justify-between py-1">
											<span className="text-(--text-secondary)">
												Dependensi
											</span>
											<span className="font-mono text-snow">
												{selectedOp.metrics.codebase.dependencyCount} paket
											</span>
										</div>
									)}
								</>
							)}
						</div>
					</div>
				</div>

				<div className="mt-6 flex justify-end">
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg border border-(--border-subtle) px-4 py-2 text-xs font-medium text-snow hover:bg-(--bg-surface) transition-colors"
					>
						Tutup
					</button>
				</div>
			</div>
		</div>
	);
}
