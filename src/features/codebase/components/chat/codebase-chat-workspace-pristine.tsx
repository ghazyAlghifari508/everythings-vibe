"use client";

import type { ReactNode } from "react";
import {
	type CodebaseStarterSuggestion,
	codebaseStarterSuggestionsSchema,
} from "@/features/codebase/services/analysis";

export interface CodebaseStarterRefreshState {
	analysisId: string;
	snapshotId: string;
	status: "pending" | "ready" | "failed";
	isRefreshing?: boolean;
	error?: string | null;
}

interface CodebaseChatWorkspacePristineProps {
	composer: ReactNode;
	newFeatureRepository?: string;
	starterSuggestions?: CodebaseStarterSuggestion[];
	starterRefresh?: CodebaseStarterRefreshState;
	/**
	 * A newer analysis attempt for the same snapshot failed while the starter
	 * cards still come from an earlier ready analysis. Shown so the failure is
	 * not hidden by the cards.
	 */
	newerAttemptFailure?: { errorMessage: string | null } | null;
	onRefreshStarterSuggestions?: (
		analysisId: string,
		snapshotId: string,
	) => void;
	onPrefillDraft: (text: string) => void;
}

export function CodebaseChatWorkspacePristine({
	composer,
	newFeatureRepository,
	starterSuggestions,
	starterRefresh,
	newerAttemptFailure,
	onRefreshStarterSuggestions,
	onPrefillDraft,
}: CodebaseChatWorkspacePristineProps) {
	const parsedStarterSuggestions =
		codebaseStarterSuggestionsSchema.safeParse(starterSuggestions);
	const validStarterSuggestions = parsedStarterSuggestions.success
		? parsedStarterSuggestions.data
		: null;

	return (
		<div
			data-testid="codebase-chat-pristine"
			className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto px-4 pt-10 pb-8 sm:pt-14 md:pt-16 lg:pt-20"
		>
			<div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
				<div className="flex flex-col items-center gap-2.5">
					<h2 className="text-2xl font-bold tracking-tight text-snow sm:text-3xl lg:text-[32px]">
						{newFeatureRepository
							? "Apa yang ingin kamu tambahkan?"
							: "Apa yang ingin kamu bangun?"}
					</h2>
					<p className="max-w-xl text-sm leading-relaxed text-fog sm:text-[15px]">
						{newFeatureRepository
							? `Rencanakan fitur baru untuk ${newFeatureRepository}.`
							: "Jelaskan fitur, perubahan, atau masalah yang ingin kamu kerjakan. everythings-vibe akan menyesuaikannya dengan struktur codebase ini."}
					</p>
				</div>

				<div className="w-full shrink-0 bg-transparent text-left">
					{composer}
				</div>

				{newerAttemptFailure ? (
					<output
						data-testid="codebase-newer-attempt-failed"
						className="block w-full text-left text-xs leading-5 text-crimson"
					>
						Analisis terbaru gagal
						{newerAttemptFailure.errorMessage
							? `: ${newerAttemptFailure.errorMessage}`
							: "."}{" "}
						Saran di bawah berasal dari analisis sebelumnya untuk snapshot yang
						sama.
					</output>
				) : null}

				{validStarterSuggestions ? (
					<div
						data-testid="codebase-intent-starters"
						className="flex w-full flex-col gap-2.5 pt-1 text-left"
					>
						<p className="text-[11px] font-semibold uppercase tracking-wider text-slate">
							Mulai dari
						</p>
						<div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
							{validStarterSuggestions.map((item) => (
								<button
									key={item.id}
									type="button"
									onClick={() => onPrefillDraft(item.prompt)}
									data-testid={`intent-starter-${item.id}`}
									className="flex min-h-[62px] flex-col items-start justify-center rounded-lg border border-slate bg-charcoal/40 p-3 text-left text-snow transition-colors hover:bg-obsidian active:bg-obsidian focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									<span className="line-clamp-1 text-xs font-medium text-snow">
										{item.title}
									</span>
									<span className="mt-0.5 line-clamp-1 text-[11px] text-fog">
										{item.description}
									</span>
								</button>
							))}
						</div>
					</div>
				) : starterRefresh?.status === "ready" &&
					onRefreshStarterSuggestions ? (
					<div className="flex w-full flex-col items-start gap-2 pt-1 text-left">
						{starterRefresh.error ? (
							<p role="alert" className="text-sm text-red-400">
								{starterRefresh.error}
							</p>
						) : null}
						<button
							type="button"
							disabled={starterRefresh.isRefreshing}
							aria-busy={starterRefresh.isRefreshing ?? false}
							data-testid="codebase-refresh-starters"
							className="rounded-md border border-graphite px-3 py-2 text-sm text-snow hover:bg-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-wait disabled:opacity-60"
							onClick={() =>
								onRefreshStarterSuggestions(
									starterRefresh.analysisId,
									starterRefresh.snapshotId,
								)
							}
						>
							{starterRefresh.isRefreshing
								? "Memperbarui saran..."
								: starterRefresh.error
									? "Coba perbarui saran"
									: "Buat saran tugas dari analisis codebase"}
						</button>
					</div>
				) : null}
			</div>
		</div>
	);
}
