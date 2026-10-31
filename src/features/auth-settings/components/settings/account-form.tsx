"use client";

import { memo, useState } from "react";
import { Input } from "@/components/ui/input";
import { deleteAccount } from "@/features/auth-settings/services/settings";

export const AccountForm = memo(function AccountForm({
	email,
}: {
	email: string;
}) {
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleteText, setDeleteText] = useState("");
	const [deleteError, setDeleteError] = useState("");

	return (
		<div className="space-y-10">
			<div className="space-y-2">
				<h3 className="font-inter font-[510] text-base font-bold">Email</h3>
				<p className="font-inter text-sm text-fog">{email}</p>
				<p className="font-inter text-xs text-slate">
					Email dikelola melalui akun Google kamu. Hubungi support untuk
					mengubah email.
				</p>
			</div>

			<hr className="border-(--border-subtle)" />

			<div className="space-y-4 rounded-xl border-2 border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 p-6">
				<div>
					<h3 className="font-inter font-[510] text-base font-bold text-red-700 dark:text-red-400">
						Danger Zone
					</h3>
					<p className="mt-1 text-sm text-red-600 dark:text-red-300">
						Hapus akun secara permanen. Semua data PRD dan chat akan dihapus.
					</p>
				</div>

				{!confirmDelete ? (
					<button
						type="button"
						onClick={() => setConfirmDelete(true)}
						className="rounded-lg border-2 border-red-300 dark:border-red-800/50 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
					>
						Hapus Akun Saya
					</button>
				) : (
					<div className="space-y-3">
						<p className="text-sm text-red-700 dark:text-red-400">
							Ketik <strong>HAPUS</strong> untuk konfirmasi
						</p>
						<Input
							value={deleteText}
							onChange={(e) => setDeleteText(e.target.value)}
							placeholder="Ketik HAPUS"
							className="max-w-xs border-red-300 dark:border-red-800/50 dark:bg-red-900/10 dark:text-white"
						/>
						<form
							action={async (data) => {
								setDeleteError("");
								try {
									await deleteAccount(data);
								} catch (error) {
									setDeleteError(
										error instanceof Error
											? error.message
											: "Penghapusan akun gagal. Coba lagi.",
									);
								}
							}}
						>
							{deleteError && <p role="alert">{deleteError}</p>}
							{/* Server-side re-check: hidden input prevents bypass via DOM manipulation */}
							<input type="hidden" name="confirm" value={deleteText} />
							<button
								type="submit"
								disabled={deleteText !== "HAPUS"}
								className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
							>
								Konfirmasi Hapus Akun
							</button>
						</form>
					</div>
				)}
			</div>
		</div>
	);
});
