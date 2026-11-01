"use client";

import {
	Copy01Icon,
	Tick01Icon,
	ViewIcon,
	ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useUIStore } from "@/store";

/**
 * The only place a raw secret is ever rendered. It lives in component state, so
 * closing the panel drops it: the server stores a hash and cannot reprint it.
 */
export function ApiKeyCreatedPanel({
	rawKey,
	onDismiss,
}: {
	rawKey: string;
	onDismiss: () => void;
}) {
	const showToast = useUIStore((s) => s.showToast);
	const [revealed, setRevealed] = useState(true);
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(rawKey);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
			showToast("API key disalin ke clipboard", "success");
		} catch {
			showToast("Gagal menyalin", "error");
		}
	};

	return (
		<div className="rounded-lg border border-emerald/30 bg-emerald/10 p-4">
			<div className="mb-2 flex items-center gap-2 text-sm font-[510] text-emerald">
				<Icon icon={Tick01Icon} size={16} />
				API key manual berhasil dibuat
			</div>
			<p className="mb-3 text-xs text-fog">
				Salin sekarang. Key ini tidak ditampilkan lagi setelah panel ini
				ditutup.
			</p>
			<div className="flex items-center gap-2">
				<code className="min-w-0 flex-1 break-all rounded bg-onyx px-3 py-2 font-mono text-xs text-snow">
					{revealed ? rawKey : "••••••••••••••••"}
				</code>
				<Button
					variant="ghost"
					size="sm"
					aria-label={revealed ? "Sembunyikan API key" : "Tampilkan API key"}
					onClick={() => setRevealed(!revealed)}
					className="shrink-0"
				>
					<Icon icon={revealed ? ViewOffSlashIcon : ViewIcon} size={14} />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					aria-label="Salin API key"
					onClick={handleCopy}
					className="shrink-0"
				>
					<Icon
						icon={copied ? Tick01Icon : Copy01Icon}
						size={14}
						className={copied ? "text-emerald" : undefined}
					/>
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={onDismiss}
					className="shrink-0"
				>
					Tutup
				</Button>
			</div>
		</div>
	);
}
