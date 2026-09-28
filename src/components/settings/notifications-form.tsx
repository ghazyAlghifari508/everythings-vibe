"use client";

import { memo } from "react";
import { updateNotificationPreferences } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import type { NotificationPreferences } from "@/types/database";

interface NotificationsFormProps {
	preferences: NotificationPreferences | null;
}

export const NotificationsForm = memo(function NotificationsForm({
	preferences,
}: NotificationsFormProps) {
	return (
		<form action={updateNotificationPreferences} className="space-y-8">
			<div className="space-y-5">
				<label className="flex items-start gap-3 rounded-lg border border-(--border-subtle) bg-(--bg-card) p-4 cursor-pointer transition-colors hover:bg-(--bg-surface)">
					<input
						type="checkbox"
						name="quota_warning"
						defaultChecked={preferences?.quotaWarning !== false}
						className="mt-0.5 h-4 w-4 accent-primary-black"
					/>
					<div>
						<p className="font-medium text-sm">Peringatan Quota</p>
						<p className="text-xs text-(--text-secondary) mt-0.5">
							Dapatkan notifikasi saat quota PRD mendekati batas
						</p>
					</div>
				</label>

				<label className="flex items-start gap-3 rounded-lg border border-(--border-subtle) bg-(--bg-card) p-4 cursor-pointer transition-colors hover:bg-(--bg-surface)">
					<input
						type="checkbox"
						name="prd_completed"
						defaultChecked={preferences?.prdCompleted !== false}
						className="mt-0.5 h-4 w-4 accent-primary-black"
					/>
					<div>
						<p className="font-medium text-sm">PRD Selesai</p>
						<p className="text-xs text-(--text-secondary) mt-0.5">
							Notifikasi ketika PRD berhasil digenerate
						</p>
					</div>
				</label>

				<label className="flex items-start gap-3 rounded-lg border border-(--border-subtle) bg-(--bg-card) p-4 cursor-pointer transition-colors hover:bg-(--bg-surface)">
					<input
						type="checkbox"
						name="payment_updates"
						defaultChecked={preferences?.paymentUpdates !== false}
						className="mt-0.5 h-4 w-4 accent-primary-black"
					/>
					<div>
						<p className="font-medium text-sm">Update Pembayaran</p>
						<p className="text-xs text-(--text-secondary) mt-0.5">
							Konfirmasi pembayaran dan update subscription
						</p>
					</div>
				</label>

				<label className="flex items-start gap-3 rounded-lg border border-(--border-subtle) bg-(--bg-card) p-4 cursor-pointer transition-colors hover:bg-(--bg-surface)">
					<input
						type="checkbox"
						name="product_updates"
						defaultChecked={preferences?.productUpdates || false}
						className="mt-0.5 h-4 w-4 accent-primary-black"
					/>
					<div>
						<p className="font-medium text-sm">Update Produk</p>
						<p className="text-xs text-(--text-secondary) mt-0.5">
							Info fitur baru dan update VibeEverything
						</p>
					</div>
				</label>
			</div>

			<Button type="submit">Simpan Preferensi</Button>
		</form>
	);
});
