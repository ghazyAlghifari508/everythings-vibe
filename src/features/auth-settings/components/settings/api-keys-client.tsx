"use client";

import {
	Add01Icon,
	Copy01Icon,
	Eraser01Icon,
	Key01Icon,
	Tick01Icon,
	ViewIcon,
	ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { useUIStore } from "@/store";
import {
	type ApiKeyRecord,
	apiKeyCleanupSchema,
} from "../../types/api-key-contracts";
import { ApiKeyCreateDialog } from "./api-key-create-dialog";
import { ApiKeysTable } from "./api-keys-table";
import { SettingsContentPanel } from "./settings-content-panel";

interface ApiKeysClientProps {
	keys: ApiKeyRecord[];
}

/** A credential the lifecycle controls can still act on: already expired, or an
 * automatic handoff key that outlived the expiry policy. */
export function isObsoleteKey(key: ApiKeyRecord): boolean {
	return (
		key.state === "expired" ||
		(key.source === "automatic" && key.state === "no-expiry")
	);
}

export function ApiKeysClient({ keys }: ApiKeysClientProps) {
	const showToast = useUIStore((s) => s.showToast);
	const [showCreate, setShowCreate] = useState(false);
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [revealCreatedKey, setRevealCreatedKey] = useState(true);
	const [revokeId, setRevokeId] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [showCleanup, setShowCleanup] = useState(false);
	const [isCleaning, setIsCleaning] = useState(false);

	const obsoleteCount = keys.filter(isObsoleteKey).length;

	const handleRevoke = async (id: string) => {
		try {
			const res = await fetch(`/api/settings/api-keys/${id}`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Gagal menghapus");
			showToast("API key berhasil dihapus", "success");
			setRevokeId(null);
			window.location.reload();
		} catch (err) {
			showToast(
				err instanceof Error ? err.message : "Gagal menghapus",
				"error",
			);
		}
	};

	const handleCleanup = async () => {
		setIsCleaning(true);
		try {
			const res = await fetch("/api/settings/api-keys/cleanup", {
				method: "POST",
			});
			if (!res.ok) throw new Error("Gagal membersihkan API key");
			const cleanup = apiKeyCleanupSchema.parse(await res.json());
			showToast(
				`${cleanup.revoked} key usang diberi batas waktu, ${cleanup.deleted} key kedaluwarsa dihapus.`,
				"success",
			);
			setShowCleanup(false);
			window.location.reload();
		} catch (err) {
			showToast(
				err instanceof Error ? err.message : "Gagal membersihkan API key",
				"error",
			);
		} finally {
			setIsCleaning(false);
		}
	};

	const handleCopy = async () => {
		if (!createdKey) return;
		try {
			await navigator.clipboard.writeText(createdKey);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
			showToast("API key disalin ke clipboard", "success");
		} catch {
			showToast("Gagal menyalin", "error");
		}
	};

	return (
		<SettingsContentPanel
			title="API Keys"
			description="Kelola API key untuk MCP server dan CLI tool."
			actions={
				<>
					{obsoleteCount > 0 && (
						<Button
							variant="outline"
							onClick={() => setShowCleanup(true)}
							className="gap-1.5"
						>
							<Icon icon={Eraser01Icon} size={14} />
							Bersihkan {obsoleteCount} key usang
						</Button>
					)}
					<Button onClick={() => setShowCreate(true)} className="gap-1.5">
						<Icon icon={Add01Icon} size={14} />
						Buat API Key Baru
					</Button>
				</>
			}
		>
			<div className="space-y-6">
				{createdKey && (
					<div className="rounded-lg border border-emerald/30 bg-emerald/10 p-4">
						<div className="flex items-center gap-2 text-sm font-[510] text-emerald mb-2">
							<Icon icon={Tick01Icon} size={16} />
							API Key Berhasil Dibuat
						</div>
						<p className="text-xs text-fog mb-3">
							Simpan key ini sekarang. Tidak akan ditampilkan lagi.
						</p>
						<div className="flex items-center gap-2">
							<code className="flex-1 rounded bg-onyx px-3 py-2 font-mono text-xs text-snow break-all">
								{revealCreatedKey ? createdKey : "••••••••••••••••"}
							</code>
							<Button
								variant="ghost"
								size="sm"
								aria-label={
									revealCreatedKey ? "Sembunyikan API key" : "Tampilkan API key"
								}
								onClick={() => setRevealCreatedKey(!revealCreatedKey)}
								className="shrink-0"
							>
								{revealCreatedKey ? (
									<Icon icon={ViewOffSlashIcon} size={14} />
								) : (
									<Icon icon={ViewIcon} size={14} />
								)}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								aria-label="Salin API key"
								onClick={handleCopy}
								className="shrink-0"
							>
								{copied ? (
									<Icon icon={Tick01Icon} size={14} className="text-emerald" />
								) : (
									<Icon icon={Copy01Icon} size={14} />
								)}
							</Button>
						</div>
					</div>
				)}

				{keys.length === 0 ? (
					<div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-8 sm:p-12 text-center">
						<div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-(--bg-card) border border-(--border-subtle) text-fog mb-3">
							<Icon icon={Key01Icon} size={20} />
						</div>
						<p className="text-sm font-medium text-snow">Belum ada API key</p>
						<p className="mt-1 text-xs text-fog max-w-sm mx-auto">
							Buat API key baru untuk menghubungkan CLI tool atau MCP server ke
							workspace kamu.
						</p>
						<Button
							onClick={() => setShowCreate(true)}
							variant="outline"
							size="sm"
							className="mt-4 gap-1.5"
						>
							<Icon icon={Add01Icon} size={14} />
							Buat API Key
						</Button>
					</div>
				) : (
					<ApiKeysTable keys={keys} onRevoke={setRevokeId} />
				)}

				<p className="text-[11px] text-fog/60">
					Note: API keys hanya ditampilkan sekali saat pembuatan. Simpan dengan
					aman.
				</p>
			</div>

			<ApiKeyCreateDialog
				open={showCreate}
				onOpenChange={setShowCreate}
				onCreated={(rawKey) => {
					setCreatedKey(rawKey);
					setRevealCreatedKey(true);
				}}
			/>

			<Dialog open={showCleanup} onOpenChange={setShowCleanup}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Bersihkan akses usang?</DialogTitle>
						<DialogDescription>
							Key otomatis warisan tanpa batas waktu diberi batas waktu (grace)
							supaya agen yang sedang berjalan tidak langsung terputus, dan key
							yang sudah kedaluwarsa dihapus dari daftar. Key manual yang masih
							berlaku tidak disentuh.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setShowCleanup(false)}
							disabled={isCleaning}
						>
							Batal
						</Button>
						<Button onClick={() => void handleCleanup()} disabled={isCleaning}>
							{isCleaning ? "Membersihkan..." : "Bersihkan"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={!!revokeId} onOpenChange={() => setRevokeId(null)}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Hapus API Key?</DialogTitle>
						<DialogDescription>
							Key ini akan langsung berhenti berfungsi. Tindakan ini tidak dapat
							dibatalkan.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setRevokeId(null)}>
							Batal
						</Button>
						<Button
							variant="destructive"
							onClick={() => revokeId && handleRevoke(revokeId)}
						>
							Hapus
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</SettingsContentPanel>
	);
}
