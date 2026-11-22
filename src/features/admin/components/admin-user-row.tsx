"use client";

import { Cancel01Icon, Shield01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusIndicator } from "@/components/ui/status-indicator";
import {
	resetUserCredit,
	setUserAdmin,
	setUserBanned,
	setUserBillingExempt,
	updateUserPlan,
} from "../services";
import type { AdminSubscriptionItem, AdminUserItem } from "../types";

export interface AdminUserRowProps {
	user: AdminUserItem;
	sub: AdminSubscriptionItem | null;
	currentUserId: string;
	isMutating: boolean;
	onAction: (actionName: string, fn: () => Promise<void>) => Promise<void>;
}

export function AdminUserRowItem({
	user,
	sub,
	currentUserId,
	isMutating,
	onAction,
}: AdminUserRowProps) {
	const plan = sub?.plan ?? "free";
	const isBanned = Boolean(user.bannedAt);
	const isAdmin = Boolean(user.isAdmin);
	const isSelf = user.id === currentUserId;
	const initial = (user.name || user.email || "?")[0].toUpperCase();

	return (
		<tr className="transition-colors hover:bg-white/[0.02]">
			{/* User info */}
			<td className="px-4 py-3">
				<div className="flex items-center gap-3">
					<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-obsidian border border-graphite text-xs font-semibold text-mist">
						{initial}
					</div>
					<div className="min-w-0">
						<p className="truncate font-[510] text-snow">
							{user.name || "Tanpa Nama"}
						</p>
						<p className="truncate text-fog text-[11px]">{user.email}</p>
					</div>
				</div>
			</td>

			{/* Plan Badge */}
			<td className="px-4 py-3">
				<Badge>
					{plan === "hengker" ? "Hengker" : plan === "pro" ? "Pro" : plan}
				</Badge>
			</td>

			{/* Credits */}
			<td className="px-4 py-3 text-fog">
				<div className="flex flex-col gap-0.5">
					<div>
						<span className="text-snow font-medium">
							{sub?.creditsUsed ?? 0}
						</span>
						<span className="text-[11px]"> / {sub?.credits ?? 0}</span>
					</div>
					<span
						title={`Bebas Biaya: ${user.billingExemptionReason ?? "internal"}`}
					>
						<Badge>Exempt</Badge>
					</span>
				</div>
			</td>

			{/* Role */}
			<td className="px-4 py-3">
				{isAdmin ? (
					<span className="inline-flex items-center gap-1 text-[11px] font-[510] text-fog">
						<Icon icon={Shield01Icon} size={12} />
						Admin
					</span>
				) : (
					<span className="text-fog text-[11px]">Member</span>
				)}
			</td>

			{/* Status */}
			<td className="px-4 py-3">
				{isBanned ? (
					<StatusBadge tone="danger" icon={Cancel01Icon}>
						Banned
					</StatusBadge>
				) : (
					<StatusIndicator tone="success">Aktif</StatusIndicator>
				)}
			</td>

			{/* Actions */}
			<td className="px-4 py-3 text-right">
				<div className="flex items-center justify-end gap-1.5">
					{/* Plan switches */}
					{plan !== "pro" && (
						<button
							type="button"
							disabled={isMutating}
							onClick={() =>
								onAction(`plan-pro-${user.id}`, () =>
									updateUserPlan({
										data: { userId: user.id, plan: "pro" },
									}),
								)
							}
							className="rounded border border-graphite bg-obsidian px-2 py-1 text-[11px] text-fog hover:border-fog/40 hover:text-snow disabled:opacity-50"
							title="Ubah paket ke Pro"
						>
							Set Pro
						</button>
					)}

					{plan !== "hengker" && (
						<button
							type="button"
							disabled={isMutating}
							onClick={() =>
								onAction(`plan-hengker-${user.id}`, () =>
									updateUserPlan({
										data: { userId: user.id, plan: "hengker" },
									}),
								)
							}
							className="rounded border border-graphite bg-obsidian px-2 py-1 text-[11px] text-fog hover:border-fog/40 hover:text-snow disabled:opacity-50"
							title="Ubah paket ke Hengker"
						>
							Set Hengker
						</button>
					)}

					{/* Reset credit */}
					<button
						type="button"
						disabled={isMutating}
						onClick={() =>
							onAction(`credit-${user.id}`, () =>
								resetUserCredit({ data: { userId: user.id } }),
							)
						}
						className="rounded border border-graphite bg-obsidian px-2 py-1 text-[11px] text-fog hover:border-fog/40 hover:text-snow disabled:opacity-50"
						title="Reset pemakaian kredit ke 0"
					>
						Reset Kredit
					</button>

					{/* Toggle Admin */}
					<button
						type="button"
						disabled={isMutating || (isSelf && isAdmin)}
						onClick={() =>
							onAction(`admin-${user.id}`, () =>
								setUserAdmin({
									data: { userId: user.id, isAdmin: !isAdmin },
								}),
							)
						}
						className="rounded border border-graphite bg-obsidian px-2 py-1 text-[11px] text-fog hover:border-fog/40 hover:text-snow disabled:opacity-50"
						title={
							isSelf && isAdmin
								? "Tidak dapat mencabut hak admin akun sendiri"
								: isAdmin
									? "Cabut Admin"
									: "Jadikan Admin"
						}
					>
						{isAdmin ? "Cabut Admin" : "Jadikan Admin"}
					</button>

					{/* Toggle Billing Exemption */}
					<button
						type="button"
						disabled={isMutating}
						onClick={() =>
							onAction(`exempt-${user.id}`, () =>
								setUserBillingExempt({
									data: {
										userId: user.id,
										billingExempt: !user.billingExempt,
										reason: !user.billingExempt ? "internal" : undefined,
									},
								}),
							)
						}
						className="rounded border border-graphite bg-obsidian px-2 py-1 text-[11px] text-fog hover:border-fog/40 hover:text-snow disabled:opacity-50"
						title={
							user.billingExempt
								? "Cabut hak bebas biaya AI"
								: "Beri hak bebas biaya AI untuk akun internal"
						}
					>
						{user.billingExempt ? "Cabut Exempt" : "Set Exempt"}
					</button>

					{/* Ban / Unban */}
					<button
						type="button"
						disabled={isMutating || isSelf}
						onClick={() =>
							onAction(`ban-${user.id}`, () =>
								setUserBanned({
									data: { userId: user.id, banned: !isBanned },
								}),
							)
						}
						className={`rounded border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
							isBanned
								? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
								: "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
						}`}
						title={
							isSelf
								? "Tidak dapat mem-ban akun sendiri"
								: isBanned
									? "Buka Ban"
									: "Ban"
						}
					>
						{isBanned ? "Buka Ban" : "Ban"}
					</button>
				</div>
			</td>
		</tr>
	);
}
