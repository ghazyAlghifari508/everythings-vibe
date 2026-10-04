import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScreenConnect } from "@/components/codebase/screen-connect";
import { SyncStatus } from "@/components/codebase/sync-status";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import {
	PLAN_CODEBASE_ID_STORAGE_KEY,
	PLAN_CODEBASE_NAME_STORAGE_KEY,
	SNAPSHOT_CONTEXT_STATUSES,
	type SyncPromptPayload,
	type SyncStatusResponse,
	syncPromptPayloadSchema,
	syncStatusResponseSchema,
} from "@/lib/codebase-sync";
import { useUIStore } from "@/store";

function readStoredPlanCodebase(): { id: string; name: string } | null {
	try {
		if (typeof sessionStorage === "undefined") return null;
		const id = sessionStorage.getItem(PLAN_CODEBASE_ID_STORAGE_KEY);
		if (!id) return null;
		const name =
			sessionStorage.getItem(PLAN_CODEBASE_NAME_STORAGE_KEY) ??
			"Repository Lokal";
		return { id, name };
	} catch {
		return null;
	}
}

function storePlanCodebase(id: string, name: string): void {
	try {
		if (typeof sessionStorage === "undefined") return;
		sessionStorage.setItem(PLAN_CODEBASE_ID_STORAGE_KEY, id);
		sessionStorage.setItem(PLAN_CODEBASE_NAME_STORAGE_KEY, name);
	} catch {
		// Storage is a best-effort pointer only; server remains source of truth.
	}
}

function clearStoredPlanCodebase(): void {
	try {
		if (typeof sessionStorage === "undefined") return;
		sessionStorage.removeItem(PLAN_CODEBASE_ID_STORAGE_KEY);
		sessionStorage.removeItem(PLAN_CODEBASE_NAME_STORAGE_KEY);
	} catch {
		// Best-effort only.
	}
}

export const Route = createFileRoute("/plan/codebase")({
	head: () => ({
		meta: [
			{ title: "Codebase Existing | VibeEverything" },
			{
				name: "description",
				content:
					"Hubungkan repository yang sudah ada untuk mendapatkan prompt CLI sync, lalu susun fitur baru di atas kode yang ada.",
			},
		],
	}),
	component: PlanCodebasePage,
});

type CreatedCodebase = {
	id: string;
	name: string;
};

export function PlanCodebasePage() {
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const [isStarting, setIsStarting] = useState(false);
	const [codebase, setCodebase] = useState<CreatedCodebase | null>(null);
	const [payload, setPayload] = useState<SyncPromptPayload | null>(null);
	const step = useUIStore((s) => s.codebasePlanStep);
	const setStep = useUIStore((s) => s.setCodebasePlanStep);
	const [lastStatus, setLastStatus] = useState<SyncStatusResponse | null>(null);
	const [sessionNonce, setSessionNonce] = useState(0);
	const autoInitAttempted = useRef(false);

	useEffect(() => {
		setStep("prompt");
	}, [setStep]);

	const createCodebase = useCallback(async () => {
		setError(null);
		setIsStarting(true);
		try {
			const response = await fetch("/api/codebases", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			if (response.status === 401) {
				window.location.href = `/login?redirect=${encodeURIComponent("/plan/codebase")}`;
				return;
			}
			const body: unknown = await response.json().catch(() => null);
			if (
				typeof body !== "object" ||
				body === null ||
				!("id" in body) ||
				typeof body.id !== "string"
			) {
				setError(
					typeof body === "object" &&
						body !== null &&
						"error" in body &&
						typeof body.error === "string"
						? body.error
						: "Codebase gagal dibuat. Coba lagi.",
				);
				return;
			}
			const sync =
				"sync" in body ? syncPromptPayloadSchema.safeParse(body.sync) : null;
			if (!sync?.success) {
				setError("Codebase dibuat, tetapi instruksi sync tidak valid.");
				return;
			}
			const codebaseName =
				"name" in body && typeof body.name === "string"
					? body.name
					: "Repository Lokal";
			setCodebase({
				id: body.id,
				name: codebaseName,
			});
			storePlanCodebase(body.id, codebaseName);
			setPayload(sync.data);
			setLastStatus(null);
			setStep("prompt");
			setSessionNonce((current) => current + 1);
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			setIsStarting(false);
		}
	}, [setStep]);

	// Refresh recovery: the stored id is only a pointer. Authoritative sync
	// state comes from GET status. A missing token after refresh is never
	// restored from storage; waiting sessions mint a fresh credential via
	// retry, while in-flight/uploaded sessions resume polling without
	// disturbing the active attempt.
	const recoverCodebase = useCallback(async (): Promise<boolean> => {
		const stored = readStoredPlanCodebase();
		if (!stored) return false;
		setError(null);
		setIsStarting(true);
		try {
			const statusResponse = await fetch(
				`/api/codebases/${encodeURIComponent(stored.id)}/status`,
			);
			if (statusResponse.status === 401) {
				window.location.href = `/login?redirect=${encodeURIComponent("/plan/codebase")}`;
				return true;
			}
			const statusParsed = syncStatusResponseSchema.safeParse(
				await statusResponse.json().catch(() => null),
			);
			if (!statusResponse.ok || !statusParsed.success) {
				clearStoredPlanCodebase();
				return false;
			}
			const recovered = statusParsed.data;
			setCodebase({ id: stored.id, name: stored.name });
			setLastStatus(recovered);
			setSessionNonce((current) => current + 1);
			// Codebase-scoped sessions stay uploaded after sync; analysis runs
			// per-feature later, so uploaded already means snapshot ready.
			if (
				recovered.snapshotId &&
				SNAPSHOT_CONTEXT_STATUSES.includes(recovered.status)
			) {
				setPayload(null);
				setStep("summary");
				return true;
			}
			if (
				recovered.status === "waiting_for_cli" ||
				recovered.status === "failed" ||
				recovered.status === "expired"
			) {
				const retryResponse = await fetch(
					`/api/codebases/${encodeURIComponent(stored.id)}/session`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ action: "retry" }),
					},
				);
				const retryParsed = syncPromptPayloadSchema.safeParse(
					await retryResponse.json().catch(() => null),
				);
				if (retryResponse.ok && retryParsed.success) {
					setPayload(retryParsed.data);
					setLastStatus(null);
					setStep("prompt");
					return true;
				}
				clearStoredPlanCodebase();
				return false;
			}
			setPayload(null);
			setStep("syncing");
			return true;
		} catch {
			clearStoredPlanCodebase();
			return false;
		} finally {
			setIsStarting(false);
		}
	}, [setStep]);

	useEffect(() => {
		if (autoInitAttempted.current) return;
		autoInitAttempted.current = true;
		// Fast path preserves the original timing: no stored pointer means
		// create immediately (synchronously sets loading state). Only stored
		// pointers pay for the async recovery round-trip.
		if (!readStoredPlanCodebase()) {
			void createCodebase();
			return;
		}
		void (async () => {
			const recovered = await recoverCodebase();
			if (!recovered) await createCodebase();
		})();
	}, [createCodebase, recoverCodebase]);

	const retrySession = async () => {
		if (!codebase) return;
		setError(null);
		setIsStarting(true);
		try {
			const response = await fetch(
				`/api/codebases/${encodeURIComponent(codebase.id)}/session`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "retry" }),
				},
			);
			const parsed = syncPromptPayloadSchema.safeParse(
				await response.json().catch(() => null),
			);
			if (!response.ok || !parsed.success) {
				setError("Sesi sync gagal dibuat. Coba lagi.");
				return;
			}
			setPayload(parsed.data);
			setLastStatus(null);
			setStep("prompt");
			setSessionNonce((current) => current + 1);
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			setIsStarting(false);
		}
	};

	const handleStatus = (status: SyncStatusResponse | null) => {
		// SyncStatus no longer reports null on polling errors, so null here
		// means no successful response yet — keep the last known good state.
		if (status === null) return;
		setLastStatus(status);
		// Plan-page summary triggers on uploaded (not ready): codebase-scoped
		// sessions stay uploaded after sync by design
		// (codebase-analysis.server.ts keeps the shared snapshot uploaded while
		// per-feature analyses run later). Requiring ready here would never
		// fire in this flow.
		if (
			status.snapshotId &&
			SNAPSHOT_CONTEXT_STATUSES.includes(status.status)
		) {
			setStep("summary");
		}
	};

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb
				current="Codebase Existing"
				parent={{ label: "VibePlan", to: "/plan" }}
			/>

			{error && (
				<div
					role="alert"
					className="rounded-xl border border-crimson/40 bg-crimson/10 p-4 text-sm text-crimson"
				>
					{error}
				</div>
			)}

			{!codebase || (!payload && !lastStatus) ? (
				<div className="flex flex-1 items-center justify-center min-h-[50vh] py-12">
					<output className="flex flex-col items-center gap-4 rounded-xl border border-graphite bg-charcoal p-8 sm:p-10 text-center max-w-sm w-full shadow-lg">
						<div
							className="h-9 w-9 animate-spin rounded-full border-2 border-graphite border-t-indigo"
							aria-hidden="true"
						/>
						<div className="space-y-1">
							<p className="text-sm font-medium text-snow">
								{isStarting
									? "Menyiapkan sesi sync..."
									: "Menunggu sesi sync..."}
							</p>
							<p className="text-xs text-fog">
								Menghubungkan repository dan menginisialisasi instruksi CLI
							</p>
						</div>
						{error && !isStarting && (
							<button
								type="button"
								onClick={() => void createCodebase()}
								className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md bg-snow px-5 text-xs font-semibold text-onyx transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								Coba lagi
							</button>
						)}
					</output>
				</div>
			) : (
				<>
					{step === "prompt" &&
						(payload ? (
							<ScreenConnect
								projectName={codebase.name}
								payload={payload}
								isStarting={isStarting}
								onAgentStarted={() => setStep("syncing")}
							/>
						) : (
							<div className="mx-auto w-full max-w-2xl rounded-xl border border-graphite bg-charcoal p-5 sm:p-6 text-center">
								<p className="text-sm font-medium text-snow">
									Sesi sync dipulihkan dari server
								</p>
								<p className="mt-1 text-xs text-fog">
									Token sync sekali-pakai tidak tersimpan di browser. Buat token
									baru untuk menjalankan CLI, atau lanjut pantau status yang
									sudah berjalan.
								</p>
								<div className="mt-4 flex flex-wrap items-center justify-center gap-3">
									<button
										type="button"
										onClick={() => void retrySession()}
										disabled={isStarting}
										className="inline-flex min-h-10 items-center rounded-md bg-snow px-5 text-xs font-semibold text-onyx transition hover:brightness-110 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
									>
										{isStarting ? "Menyiapkan..." : "Dapatkan token baru"}
									</button>
									<button
										type="button"
										onClick={() => setStep("syncing")}
										className="inline-flex min-h-10 items-center rounded-md border border-graphite bg-obsidian px-3.5 text-xs font-medium text-fog hover:border-steel hover:text-snow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
									>
										Lanjut ke Pantau Sync →
									</button>
								</div>
							</div>
						))}

					{step === "syncing" && (
						<SyncStatus
							key={sessionNonce}
							projectId={codebase.id}
							projectName={codebase.name}
							status={lastStatus}
							statusPath={`/api/codebases/${encodeURIComponent(codebase.id)}/status`}
							onStatus={handleStatus}
							onRetrySync={() => void retrySession()}
							onBackToInstructions={() => setStep("prompt")}
							onViewReview={() => setStep("summary")}
						/>
					)}

					{step === "summary" && (
						<section
							data-testid="codebase-sync-summary"
							className="mx-auto w-full max-w-2xl rounded-xl border border-emerald/30 bg-charcoal p-5 sm:p-6"
						>
							<div className="flex items-center justify-between">
								<p className="font-mono text-[11px] uppercase tracking-widest text-emerald">
									✓ Snapshot Terverifikasi
								</p>
								<span className="rounded bg-emerald-bg px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald border border-emerald/30">
									Siap Digunakan
								</span>
							</div>
							<h2 className="mt-2 text-xl font-semibold text-snow">
								Kesimpulan Analisis Codebase & Stack
							</h2>
							<p className="mt-1 text-xs text-fog">
								Codebase telah siap. Anda dapat melanjutkan ke ruang kerja
								3-pane untuk merancang fitur secara adaptif.
							</p>

							<dl className="mt-5 flex flex-col gap-2.5 text-sm">
								<div className="flex items-center justify-between gap-3 rounded-lg border border-graphite bg-obsidian px-3.5 py-2.5">
									<dt className="text-fog">Repository</dt>
									<dd className="font-semibold text-snow">{codebase.name}</dd>
								</div>
								<div className="flex items-center justify-between gap-3 rounded-lg border border-graphite bg-obsidian px-3.5 py-2.5">
									<dt className="text-fog">File tersinkron</dt>
									<dd className="font-mono text-snow">
										{lastStatus?.fileCount ?? "-"} file
										{typeof lastStatus?.excludedCount === "number"
											? ` (${lastStatus.excludedCount} dikecualikan)`
											: ""}
									</dd>
								</div>
								<div className="flex items-center justify-between gap-3 rounded-lg border border-graphite bg-obsidian px-3.5 py-2.5">
									<dt className="text-fog">Snapshot ID</dt>
									<dd className="truncate font-mono text-xs text-mist max-w-[280px]">
										{lastStatus?.snapshotId ?? "-"}
									</dd>
								</div>
							</dl>

							<div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-graphite/60 pt-4">
								<button
									type="button"
									onClick={() => setStep("syncing")}
									className="inline-flex min-h-10 items-center rounded-md border border-graphite bg-obsidian px-3.5 text-xs font-medium text-fog hover:border-steel hover:text-snow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									← Kembali ke Pantau Sync
								</button>
								<button
									type="button"
									onClick={() =>
										void navigate({
											to: "/codebases/$id",
											params: { id: codebase.id },
										})
									}
									className="inline-flex min-h-10 items-center rounded-md bg-snow px-5 text-xs font-semibold text-onyx transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									Masuk ke 3-Pane Workspace →
								</button>
							</div>
						</section>
					)}
				</>
			)}
		</main>
	);
}
