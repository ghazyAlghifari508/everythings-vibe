"use client";

import { Layers01Icon, RotateLeft01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";

export function CodebaseChatWorkspaceLoading() {
	return (
		<div
			data-testid="codebase-chat-loading"
			aria-busy="true"
			className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-6"
		>
			<p className="text-xs text-fog">Memuat planning yang tersimpan...</p>
			<div className="flex flex-col gap-2.5">
				{["a", "b", "c"].map((row) => (
					<div
						key={row}
						className="h-16 animate-pulse rounded-lg border border-graphite bg-charcoal/60"
					/>
				))}
			</div>
		</div>
	);
}

export function CodebaseChatWorkspacePlanUnavailable() {
	return (
		<div
			data-testid="codebase-chat-plan-unavailable"
			className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center"
		>
			<p className="text-sm font-semibold text-snow">
				Planning tidak dapat dimuat
			</p>
			<p className="max-w-sm text-xs leading-5 text-fog">
				Data planning tersimpan di server, tetapi tidak dapat dibaca saat ini.
				Coba muat ulang halaman.
			</p>
			<button
				type="button"
				onClick={() => window.location.reload()}
				className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-graphite px-3 text-xs text-snow hover:bg-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
			>
				<Icon icon={RotateLeft01Icon} size={13} aria-hidden="true" />
				Muat ulang
			</button>
		</div>
	);
}

export function CodebaseChatWorkspacePlanSelection() {
	return (
		<div
			data-testid="codebase-chat-plan-selection"
			className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center"
		>
			<Icon
				icon={Layers01Icon}
				size={20}
				aria-hidden="true"
				className="text-fog"
			/>
			<p className="text-sm font-semibold text-snow">
				Pilih fitur yang ingin dikerjakan
			</p>
			<p className="max-w-sm text-xs leading-5 text-fog">
				Repository ini punya beberapa fitur plan. Pilih satu dari daftar di atas
				untuk melanjutkan — setiap fitur punya planning sendiri.
			</p>
		</div>
	);
}
