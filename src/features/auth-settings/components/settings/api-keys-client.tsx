"use client";

import { Add01Icon } from "@hugeicons/core-free-icons";
import { useRouter } from "@tanstack/react-router";
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
import { ApiAccessList, ApiAdvancedSection } from "./api-access-list";
import { ApiKeyCreateDialog } from "./api-key-create-dialog";
import { ApiKeyCreatedPanel } from "./api-key-created-panel";
import { SettingsContentPanel } from "./settings-content-panel";

interface ApiKeysClientProps {
	keys: ApiKeyRecord[];
}

export function ApiKeysClient({ keys }: ApiKeysClientProps) {
	const showToast = useUIStore((s) => s.showToast);
	const router = useRouter();
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [showCreate, setShowCreate] = useState(false);
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [revokeId, setRevokeId] = useState<string | null>(null);
	const [isRevoking, setIsRevoking] = useState(false);
	const [showCleanup, setShowCleanup] = useState(false);
	const [isCleaning, setIsCleaning] = useState(false);

	const revokeTarget = keys.find((k) => k.id === revokeId) ?? null;

	const handleRevoke = async (id: string) => {
		setIsRevoking(true);
		try {
			const res = await fetch(`/api/settings/api-keys/${id}`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Gagal mencabut akses");
			showToast("Akses dicabut", "success");
			setRevokeId(null);
			await router.invalidate();
		} catch (err) {
			showToast(
				err instanceof Error ? err.message : "Gagal mencabut akses",
				"error",
			);
		} finally {
			setIsRevoking(false);
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
				`${cleanup.revoked} akses usang diberi batas waktu, ${cleanup.deleted} akses kedaluwarsa dihapus.`,
				"success",
			);
			setShowCleanup(false);
			await router.invalidate();
		} catch (err) {
			showToast(
				err instanceof Error ? err.message : "Gagal membersihkan API key",
				"error",
			);
		} finally {
			setIsCleaning(false);
		}
	};

	return (
		<SettingsContentPanel
			title="API Keys"
			description="Kelola API key yang digunakan untuk menghubungkan AI Agent dan tool lainnya."
		>
			<div className="space-y-8">
				{createdKey && (
					<ApiKeyCreatedPanel
						rawKey={createdKey}
						onDismiss={() => setCreatedKey(null)}
					/>
				)}

				<ApiAccessList
					keys={keys}
					onRevoke={setRevokeId}
					onCleanup={() => setShowCleanup(true)}
				/>

				<ApiAdvancedSection
					open={showAdvanced}
					onToggle={() => setShowAdvanced((v) => !v)}
				>
					<p className="text-xs leading-relaxed text-fog">
						Hanya untuk integrasi yang tidak lewat serah-terima otomatis,
						misalnya MCP server atau skrip CI milikmu. Key manual tidak punya
						masa berlaku bawaan dan hanya ditampilkan sekali saat dibuat.
					</p>
					<div>
						<Button
							onClick={() => setShowCreate(true)}
							variant="outline"
							size="sm"
							className="gap-1.5"
						>
							<Icon icon={Add01Icon} size={14} />
							Buat API key
						</Button>
					</div>
				</ApiAdvancedSection>
			</div>

			<ApiKeyCreateDialog
				open={showCreate}
				onOpenChange={setShowCreate}
				onCreated={(rawKey) => {
					setCreatedKey(rawKey);
					// The new row is now listable; the secret panel stays mounted above it.
					void router.invalidate();
				}}
			/>

			<Dialog open={showCleanup} onOpenChange={setShowCleanup}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Bersihkan API key usang?</DialogTitle>
						<DialogDescription>
							Key otomatis tanpa batas waktu akan diberi batas waktu, dan key
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
						<Button onClick={() => void handleCleanup()} isLoading={isCleaning}>
							Bersihkan
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={revokeTarget !== null}
				onOpenChange={(open) => {
					if (!open) setRevokeId(null);
				}}
			>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Cabut akses?</DialogTitle>
						<DialogDescription>
							{revokeTarget
								? `Akses "${revokeTarget.name}" akan langsung berhenti berfungsi.`
								: "Akses ini akan langsung berhenti berfungsi."}{" "}
							Integrasi CLI atau agent yang masih memakai kredensial ini akan
							terputus dan perlu dihubungkan ulang. Akses lain tidak
							terpengaruh. Tindakan ini tidak bisa dibatalkan.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setRevokeId(null)}
							disabled={isRevoking}
						>
							Batal
						</Button>
						<Button
							variant="destructive"
							onClick={() => revokeId && handleRevoke(revokeId)}
							isLoading={isRevoking}
						>
							Cabut akses
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</SettingsContentPanel>
	);
}
