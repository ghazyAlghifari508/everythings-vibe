"use client";

import { Alert02Icon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export interface CodebaseChatWorkspaceErrorRowProps {
	message: string | null;
	title?: string;
	description?: string;
	actionLabel?: string;
	isRetrying?: boolean;
	onRetry?: () => void;
}

export function resolveCodebaseErrorDetails(
	message: string | null,
	fallbackTitle: string,
	fallbackActionLabel = "Coba lagi",
): {
	title: string;
	description: string;
	actionLabel: string;
} {
	if (!message || message.trim().length === 0) {
		return {
			title: fallbackTitle,
			description: "Terjadi kesalahan. Data dan status tetap aman di layar.",
			actionLabel: fallbackActionLabel,
		};
	}

	const trimmed = message.trim();
	const lower = trimmed.toLowerCase();

	// Connectivity / network error
	if (
		lower.includes("jaringan terputus") ||
		lower.includes("koneksi ke server terputus") ||
		lower.includes("server tidak dapat dihubungi") ||
		lower.includes("network_unavailable") ||
		lower.includes("failed to fetch") ||
		lower.includes("fetch failed")
	) {
		return {
			title: "Koneksi ke server terputus",
			description:
				trimmed.includes("Jawaban tetap tersimpan") ||
				trimmed.includes("tetap tersedia")
					? trimmed
					: `${trimmed} Status proses belum dapat diperbarui. Periksa kembali statusnya sebelum memulai percobaan baru.`,
			actionLabel: "Periksa status",
		};
	}

	// Persistence failure (data safe on screen)
	if (
		lower.includes("gagal disimpan") ||
		lower.includes("tidak dapat disimpan") ||
		lower.includes("timeout") ||
		lower.includes("terlalu lama")
	) {
		return {
			title: "Hasil belum berhasil disimpan",
			description:
				trimmed.includes("tetap aman") || trimmed.includes("tetap tersimpan")
					? trimmed
					: `${trimmed} Permintaan fiturmu dan input di layar tetap tersedia.`,
			actionLabel: "Coba lagi",
		};
	}

	// Session / auth failure
	if (
		lower.includes("sesi anda telah berakhir") ||
		lower.includes("unauthorized") ||
		lower.includes("401")
	) {
		return {
			title: "Sesi Anda telah berakhir",
			description: trimmed,
			actionLabel: "Login kembali",
		};
	}

	// Insufficient credits
	if (
		lower.includes("kredit habis") ||
		lower.includes("kredit tidak mencukupi") ||
		lower.includes("hanya tersedia di paket")
	) {
		return {
			title: "Kredit atau akses terbatas",
			description: trimmed,
			actionLabel: "Coba lagi",
		};
	}

	// Repository context not ready
	if (lower.includes("konteks repositori belum siap")) {
		return {
			title: "Konteks repositori belum siap",
			description: trimmed,
			actionLabel: "Coba lagi",
		};
	}

	// Confirmed spec / stage generation failure
	if (
		lower.includes("spesifikasi fitur gagal dibuat") ||
		lower.includes("pertanyaan klarifikasi tidak dapat dibuat")
	) {
		return {
			title: "Spesifikasi fitur belum berhasil dibuat",
			description: trimmed,
			actionLabel: "Coba lagi",
		};
	}

	// Default fallback
	return {
		title: fallbackTitle,
		description: trimmed,
		actionLabel: fallbackActionLabel,
	};
}

export function CodebaseChatWorkspaceSpecError({
	message,
	title,
	description,
	actionLabel,
	isRetrying,
	onRetry,
}: CodebaseChatWorkspaceErrorRowProps) {
	const resolved = resolveCodebaseErrorDetails(
		message,
		title ?? "Spesifikasi fitur belum berhasil dibuat",
		actionLabel ?? "Coba lagi",
	);
	const finalTitle = title ?? resolved.title;
	const finalDesc = description ?? resolved.description;
	const finalAction = actionLabel ?? resolved.actionLabel;

	return (
		<Alert
			variant="default"
			data-testid="codebase-spec-error"
			className="rounded-xl border border-graphite/80 bg-charcoal p-3.5 text-xs text-snow shadow-none"
		>
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
				<div className="flex items-start gap-2.5 min-w-0">
					<Icon
						icon={Alert02Icon}
						size={16}
						aria-hidden="true"
						className="mt-0.5 shrink-0 text-crimson"
					/>
					<div className="flex flex-col gap-0.5 min-w-0">
						<AlertTitle className="text-xs font-semibold text-snow">
							{finalTitle}
						</AlertTitle>
						<AlertDescription className="mt-0 text-xs text-fog leading-relaxed">
							{finalDesc}
						</AlertDescription>
					</div>
				</div>
				{onRetry ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onRetry}
						disabled={isRetrying}
						className="shrink-0 h-8 gap-1.5 border-graphite bg-obsidian px-3 font-mono text-[11px] text-snow hover:bg-graphite/30 disabled:opacity-50"
					>
						{finalAction}
					</Button>
				) : null}
			</div>
		</Alert>
	);
}

export function CodebaseChatWorkspaceStageError({
	message,
	title,
	description,
	actionLabel,
	isRetrying,
	onRetry,
}: CodebaseChatWorkspaceErrorRowProps) {
	const resolved = resolveCodebaseErrorDetails(
		message,
		title ?? "Generasi tahap pipeline belum berhasil",
		actionLabel ?? "Coba lagi",
	);
	const finalTitle = title ?? resolved.title;
	const finalDesc = description ?? resolved.description;
	const finalAction = actionLabel ?? resolved.actionLabel;

	return (
		<Alert
			variant="default"
			data-testid="codebase-stage-error"
			className="rounded-xl border border-graphite/80 bg-charcoal p-3.5 text-xs text-snow shadow-none"
		>
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
				<div className="flex items-start gap-2.5 min-w-0">
					<Icon
						icon={Alert02Icon}
						size={16}
						aria-hidden="true"
						className="mt-0.5 shrink-0 text-crimson"
					/>
					<div className="flex flex-col gap-0.5 min-w-0">
						<AlertTitle className="text-xs font-semibold text-snow">
							{finalTitle}
						</AlertTitle>
						<AlertDescription className="mt-0 text-xs text-fog leading-relaxed">
							{finalDesc}
						</AlertDescription>
					</div>
				</div>
				{onRetry ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onRetry}
						disabled={isRetrying}
						className="shrink-0 h-8 gap-1.5 border-graphite bg-obsidian px-3 font-mono text-[11px] text-snow hover:bg-graphite/30 disabled:opacity-50"
					>
						{finalAction}
					</Button>
				) : null}
			</div>
		</Alert>
	);
}
