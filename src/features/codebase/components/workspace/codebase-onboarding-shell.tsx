"use client";

import { LockIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import type { AnalysisCreditStatus } from "@/features/codebase/services/analysis-credit-policy";
import { ScreenConnectAgentStep } from "./screen-connect-agent-step";

export function CodebaseOnboardingShell({
	projectName,
	creditStatus,
	isStarting,
	createError,
	onStart,
	onTopUp,
}: {
	projectName?: string | null;
	creditStatus: AnalysisCreditStatus | null;
	isStarting: boolean;
	createError: string | null;
	onStart?: () => void;
	onTopUp?: () => void;
}) {
	const blocked =
		creditStatus !== null &&
		(creditStatus.code === "INSUFFICIENT_CREDITS" ||
			creditStatus.code === "SUBSCRIPTION_PAUSED");
	const free = creditStatus?.code === "FREE_ALLOWANCE_AVAILABLE";
	return (
		<div className="w-full animate-enter">
			<div className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-iron bg-obsidian">
				<div className="border-b border-graphite p-5 sm:p-6">
					<div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">
						Project / {projectName ?? "Repository baru"}
					</div>
					<h2 className="font-inter text-lg font-[600] text-snow sm:text-xl">
						Sync codebase dengan everythings-vibe
					</h2>
					<p className="mt-1.5 text-xs leading-relaxed text-fog sm:text-sm">
						Ikuti tiga langkah ini untuk menghubungkan repository lokal kamu.
					</p>
				</div>
				<div className="flex flex-col gap-6 p-5 sm:p-6">
					<div className="flex items-start gap-3.5">
						<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist">
							1
						</span>
						<div className="flex flex-1 flex-col gap-2">
							<div className="text-xs font-semibold text-mist">
								Salin instruksi untuk AI agent
							</div>
							{blocked && creditStatus ? (
								<div className="rounded-lg border border-graphite bg-onyx p-4">
									<div
										data-testid="locked-prompt-region"
										className="flex flex-col items-center gap-3 py-6 text-center"
									>
										<span className="flex h-10 w-10 items-center justify-center rounded-full border border-graphite bg-obsidian">
											<Icon icon={LockIcon} size={18} className="text-fog" />
										</span>
										<p className="text-xs leading-relaxed text-fog">
											Kredit belum cukup untuk analisis.
										</p>
										<button
											type="button"
											onClick={onTopUp}
											className="inline-flex min-h-11 items-center justify-center rounded-md bg-snow px-5 text-xs font-semibold text-onyx transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
										>
											Tambahkan Kredit
										</button>
									</div>
								</div>
							) : (
								<div className="flex flex-col gap-3 rounded-lg border border-graphite bg-onyx p-4">
									{!creditStatus ? (
										<div className="flex items-center justify-center gap-2 py-2 text-xs text-fog">
											<Spinner size={14} className="text-blue-400" />
											<span>Memeriksa kebutuhan kredit...</span>
										</div>
									) : (
										<>
											<p className="text-[11px] leading-relaxed text-fog">
												{free
													? "Analisis awal gratis, sekali per akun."
													: `Analisis: maksimal ${creditStatus.maximumCredits} kredit`}
											</p>
											<button
												type="button"
												onClick={onStart}
												disabled={isStarting}
												className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-snow px-5 text-xs font-semibold text-onyx transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
											>
												{isStarting
													? "Menyiapkan sesi..."
													: "Siapkan instruksi"}
											</button>
										</>
									)}
								</div>
							)}
							{createError && (
								<p role="alert" className="text-xs text-crimson">
									{createError}
								</p>
							)}
						</div>
					</div>
					<ScreenConnectAgentStep />
					<div className="flex items-start gap-3.5">
						<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist">
							3
						</span>
						<div className="flex flex-1 flex-col gap-2">
							<div className="text-xs font-semibold text-mist">
								Pantau progres
							</div>
							<p className="text-[11px] leading-relaxed text-fog">
								{blocked
									? "Sinkronisasi belum dimulai"
									: "Menunggu agent terhubung"}
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
