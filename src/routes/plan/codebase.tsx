import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScreenConnect } from "@/components/codebase/screen-connect";
import { SyncStatus } from "@/components/codebase/sync-status";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import {
	SNAPSHOT_CONTEXT_STATUSES,
	type SyncPromptPayload,
	type SyncStatusResponse,
	syncPromptPayloadSchema,
} from "@/lib/codebase-sync";

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

type PlanStep = "prompt" | "syncing" | "summary";

export function PlanCodebasePage() {
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const [isStarting, setIsStarting] = useState(false);
	const [codebase, setCodebase] = useState<CreatedCodebase | null>(null);
	const [payload, setPayload] = useState<SyncPromptPayload | null>(null);
	const [step, setStep] = useState<PlanStep>("prompt");
	const [lastStatus, setLastStatus] = useState<SyncStatusResponse | null>(null);
	const [sessionNonce, setSessionNonce] = useState(0);
	const autoInitAttempted = useRef(false);

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
			setCodebase({
				id: body.id,
				name:
					"name" in body && typeof body.name === "string"
						? body.name
						: "Repository Lokal",
			});
			setPayload(sync.data);
			setLastStatus(null);
			setStep("prompt");
			setSessionNonce((current) => current + 1);
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			setIsStarting(false);
		}
	}, []);

	useEffect(() => {
		if (autoInitAttempted.current) return;
		autoInitAttempted.current = true;
		void createCodebase();
	}, [createCodebase]);

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
		setLastStatus(status);
		if (
			status?.snapshotId &&
			SNAPSHOT_CONTEXT_STATUSES.includes(status.status)
		) {
			setStep("summary");
		}
	};

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb
				current="Codebase Existing"
				parent={{ label: "VibePlan", to: "/plan" }}
			/>

			<header className="mx-auto max-w-xl text-center">
				<p className="font-mono text-xs uppercase tracking-widest text-fog">
					VibePlan / Codebase Existing
				</p>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
					Hubungkan codebase yang sudah ada
				</h1>
				<p className="mt-3 text-sm leading-6 text-fog">
					Salin prompt sync ke AI coding agent, pantau status koneksi sampai
					snapshot terverifikasi, lalu masuk ke workspace.
				</p>
			</header>

			{error && (
				<div
					role="alert"
					className="rounded-xl border border-crimson/40 bg-crimson/10 p-4 text-sm text-crimson"
				>
					{error}
				</div>
			)}

			{!codebase || !payload ? (
				<output className="flex flex-col items-center gap-3 rounded-xl border border-graphite bg-charcoal p-8 text-center">
					<div className="h-8 w-8 animate-spin rounded-full border-2 border-graphite border-t-indigo" />
					<p className="text-sm text-fog">
						{isStarting ? "Menyiapkan sesi sync..." : "Menunggu sesi sync..."}
					</p>
					{error && !isStarting && (
						<button
							type="button"
							onClick={() => void createCodebase()}
							className="inline-flex min-h-11 items-center rounded-md bg-snow px-4 text-sm font-semibold text-onyx focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Coba lagi
						</button>
					)}
				</output>
			) : (
				<>
					{step === "prompt" && (
						<ScreenConnect
							projectName={codebase.name}
							payload={payload}
							isStarting={isStarting}
							onAgentStarted={() => setStep("syncing")}
						/>
					)}

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
							onViewReview={() =>
								void navigate({
									to: "/codebases/$id",
									params: { id: codebase.id },
								})
							}
						/>
					)}

					{step === "summary" && (
						<section
							data-testid="codebase-sync-summary"
							className="mx-auto w-full max-w-2xl rounded-xl border border-emerald/30 bg-charcoal p-5 sm:p-6"
						>
							<p className="font-mono text-[11px] uppercase tracking-widest text-emerald">
								Sync selesai
							</p>
							<h2 className="mt-2 text-xl font-semibold text-snow">
								Snapshot codebase terverifikasi
							</h2>
							<dl className="mt-4 flex flex-col gap-2 text-sm">
								<div className="flex items-center justify-between gap-3 rounded-lg border border-graphite bg-obsidian px-3 py-2">
									<dt className="text-fog">File tersinkron</dt>
									<dd className="font-mono text-snow">
										{lastStatus?.fileCount ?? "-"} file
										{typeof lastStatus?.excludedCount === "number"
											? ` (${lastStatus.excludedCount} dikecualikan)`
											: ""}
									</dd>
								</div>
								<div className="flex items-center justify-between gap-3 rounded-lg border border-graphite bg-obsidian px-3 py-2">
									<dt className="text-fog">Snapshot</dt>
									<dd className="truncate font-mono text-xs text-snow">
										{lastStatus?.snapshotId ?? "-"}
									</dd>
								</div>
							</dl>
							<div className="mt-5 flex flex-wrap items-center justify-end gap-2">
								<button
									type="button"
									onClick={() => setStep("syncing")}
									className="inline-flex min-h-11 items-center rounded-md border border-graphite px-4 text-sm font-medium text-fog transition hover:border-steel hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									Pantau sync
								</button>
								<button
									type="button"
									onClick={() =>
										void navigate({
											to: "/codebases/$id",
											params: { id: codebase.id },
										})
									}
									className="inline-flex min-h-11 items-center rounded-md bg-snow px-4 text-sm font-semibold text-onyx transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									Masuk ke Workspace
								</button>
							</div>
						</section>
					)}
				</>
			)}
		</main>
	);
}
