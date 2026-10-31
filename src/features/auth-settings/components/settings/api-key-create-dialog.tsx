"use client";

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
import { useUIStore } from "@/store";
import { createdApiKeySchema } from "../../types/api-key-contracts";
import {
	API_KEY_SCOPE_OPTIONS,
	AUTO_API_KEY_SCOPES,
} from "../../types/api-key-scopes";

interface ApiKeyCreateDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Raw credential returned exactly once by the server. */
	onCreated: (rawKey: string) => void;
}

/** Server error envelopes carry a human-readable `error`; nothing else is shown
 * because a raw response body may echo request data back. */
function readApiError(payload: unknown): string | null {
	if (payload && typeof payload === "object" && "error" in payload) {
		const error: unknown = payload.error;
		if (typeof error === "string") return error;
	}
	return null;
}

export function ApiKeyCreateDialog({
	open,
	onOpenChange,
	onCreated,
}: ApiKeyCreateDialogProps) {
	const showToast = useUIStore((s) => s.showToast);
	const [name, setName] = useState("");
	const [scopes, setScopes] = useState<string[]>([...AUTO_API_KEY_SCOPES]);
	const [isCreating, setIsCreating] = useState(false);

	const handleCreate = async () => {
		if (!name.trim()) return;
		setIsCreating(true);
		try {
			const res = await fetch("/api/settings/api-keys", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, scopes }),
			});
			const payload: unknown = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(readApiError(payload) ?? "Gagal membuat API key");
			}
			onCreated(createdApiKeySchema.parse(payload).rawKey);
			onOpenChange(false);
			setName("");
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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
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
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Claude Code, Cursor, dll"
							className="w-full rounded-md border border-graphite bg-onyx px-3 py-2 text-sm text-snow focus:border-indigo focus:outline-none"
						/>
					</div>
					<fieldset>
						<legend className="text-xs font-[510] text-snow mb-1 block">
							Scope
						</legend>
						<div className="space-y-2">
							{API_KEY_SCOPE_OPTIONS.map((opt) => (
								<label
									key={opt.value}
									className="flex items-center gap-2 text-sm text-fog cursor-pointer"
								>
									<input
										type="checkbox"
										checked={scopes.includes(opt.value)}
										onChange={(e) => {
											if (e.target.checked)
												setScopes((prev) => [...prev, opt.value]);
											else
												setScopes((prev) =>
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
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Batal
					</Button>
					<Button
						onClick={handleCreate}
						disabled={!name.trim() || isCreating}
						isLoading={isCreating}
					>
						Buat Key
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
