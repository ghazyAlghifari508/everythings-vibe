"use client";

import {
	Add01Icon,
	Copy01Icon,
	Delete02Icon,
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
import { SettingsContentPanel } from "./settings-content-panel";

interface ApiKeyRecord {
	id: string;
	name: string;
	key_prefix: string;
	scopes: string[];
	last_used_at: string | null;
	created_at: string;
	expires_at: string | null;
}

interface ApiKeysClientProps {
	keys: ApiKeyRecord[];
}

export function ApiKeysClient({ keys }: ApiKeysClientProps) {
	const showToast = useUIStore((s) => s.showToast);
	const [showCreate, setShowCreate] = useState(false);
	const [newKeyName, setNewKeyName] = useState("");
	const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
		"read:project",
		"write:task:status",
		"write:subtask:status",
	]);
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [showCreatedKey, setShowCreatedKey] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const [revokeId, setRevokeId] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const SCOPE_OPTIONS = [
		{ value: "read:project", label: "Read project data" },
		{ value: "write:task:status", label: "Update task status" },
		{ value: "write:subtask:status", label: "Update subtask status" },
	];

	const handleCreate = async () => {
		if (!newKeyName.trim()) return;
		setIsCreating(true);
		try {
			const res = await fetch("/api/settings/api-keys", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: newKeyName, scopes: newKeyScopes }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);
			setCreatedKey(data.rawKey);
			setShowCreatedKey(true);
			showToast("API key berhasil dibuat", "success");
		} catch (err) {
			showToast(
				err instanceof Error ? err.message : "Gagal membuat API key",
				"error",
			);
		} finally {
			setIsCreating(false);
		}
	};

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

	const formatDate = (d: string | null) =>
		d ? new Date(d).toLocaleDateString("id-ID") : "-";
	const formatTime = (d: string | null) =>
		d
			? new Date(d).toLocaleTimeString("id-ID", {
					hour: "2-digit",
					minute: "2-digit",
				})
			: "Never";

	return (
		<SettingsContentPanel
			title="API Keys"
			description="Kelola API key untuk MCP server dan CLI tool."
			actions={
				<Button onClick={() => setShowCreate(true)} className="gap-1.5">
					<Icon icon={Add01Icon} size={14} />
					Buat API Key Baru
				</Button>
			}
		>
			<div className="space-y-6">
				{/* Key created - show raw key ONCE */}
				{showCreatedKey && createdKey && (
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
								{showCreatedKey ? createdKey : "••••••••••••••••"}
							</code>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setShowCreatedKey(!showCreatedKey)}
								className="shrink-0"
							>
								{showCreatedKey ? (
									<Icon icon={ViewOffSlashIcon} size={14} />
								) : (
									<Icon icon={ViewIcon} size={14} />
								)}
							</Button>
							<Button
								variant="ghost"
								size="sm"
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

				{/* Keys Table / Empty State */}
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
					<div className="overflow-x-auto rounded-lg border border-(--border-subtle)">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-(--border-subtle) bg-(--bg-surface) text-left text-xs text-fog">
									<th className="px-4 py-3 font-medium">Nama</th>
									<th className="px-4 py-3 font-medium">Prefix</th>
									<th className="px-4 py-3 font-medium">Scopes</th>
									<th className="px-4 py-3 font-medium">Last Used</th>
									<th className="px-4 py-3 font-medium">Created</th>
									<th className="px-4 py-3 text-right font-medium">Aksi</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-(--border-subtle)">
								{keys.map((key) => (
									<tr
										key={key.id}
										className="hover:bg-(--bg-surface)/50 transition-colors"
									>
										<td className="px-4 py-3 font-[510] text-snow">
											{key.name}
										</td>
										<td className="px-4 py-3 font-mono text-xs text-fog">
											{key.key_prefix}...
										</td>
										<td className="px-4 py-3">
											<div className="flex flex-wrap gap-1">
												{(key.scopes || []).map((s) => (
													<span
														key={s}
														className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-fog"
													>
														{s}
													</span>
												))}
											</div>
										</td>
										<td className="px-4 py-3 text-xs text-fog">
											{key.last_used_at
												? formatTime(key.last_used_at)
												: "Never"}
										</td>
										<td className="px-4 py-3 text-xs text-fog">
											{formatDate(key.created_at)}
										</td>
										<td className="px-4 py-3 text-right">
											<Button
												variant="ghost"
												size="sm"
												aria-label={`Hapus key ${key.name}`}
												onClick={() => setRevokeId(key.id)}
												className="text-crimson hover:bg-crimson/10"
											>
												<Icon icon={Delete02Icon} size={14} />
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				<p className="text-[11px] text-fog/60">
					Note: API keys hanya ditampilkan sekali saat pembuatan. Simpan dengan
					aman.
				</p>
			</div>

			{/* Create Modal */}
			<Dialog open={showCreate} onOpenChange={setShowCreate}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Buat API Key Baru</DialogTitle>
						<DialogDescription>
							Buat key untuk menghubungkan MCP server atau CLI.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div>
							<label
								htmlFor="api-key-name"
								className="text-xs font-[510] text-snow mb-1 block"
							>
								Nama
							</label>
							<input
								id="api-key-name"
								value={newKeyName}
								onChange={(e) => setNewKeyName(e.target.value)}
								placeholder="Claude Code, Cursor, dll"
								className="w-full rounded-md border border-graphite bg-onyx px-3 py-2 text-sm text-snow focus:border-indigo focus:outline-none"
							/>
						</div>
						<fieldset>
							<legend className="text-xs font-[510] text-snow mb-1 block">
								Scope
							</legend>
							<div className="space-y-2">
								{SCOPE_OPTIONS.map((opt) => (
									<label
										key={opt.value}
										className="flex items-center gap-2 text-sm text-fog cursor-pointer"
									>
										<input
											type="checkbox"
											checked={newKeyScopes.includes(opt.value)}
											onChange={(e) => {
												if (e.target.checked)
													setNewKeyScopes((prev) => [...prev, opt.value]);
												else
													setNewKeyScopes((prev) =>
														prev.filter((s) => s !== opt.value),
													);
											}}
											className="rounded border-graphite"
										/>
										{opt.label}
									</label>
								))}
							</div>
						</fieldset>
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setShowCreate(false)}>
							Batal
						</Button>
						<Button
							onClick={handleCreate}
							disabled={!newKeyName.trim() || isCreating}
							isLoading={isCreating}
						>
							Buat Key
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Revoke Confirmation */}
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
