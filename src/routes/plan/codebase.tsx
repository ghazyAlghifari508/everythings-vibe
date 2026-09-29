import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ScreenConnect } from "@/components/codebase/screen-connect";
import { SyncStatus } from "@/components/codebase/sync-status";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import {
	type SyncPromptPayload,
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

export function PlanCodebasePage() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [codebase, setCodebase] = useState<CreatedCodebase | null>(null);
	const [payload, setPayload] = useState<SyncPromptPayload | null>(null);
	const [agentStarted, setAgentStarted] = useState(false);
	const [sessionNonce, setSessionNonce] = useState(0);

	const createCodebase = async () => {
		const trimmed = name.trim();
		if (trimmed.length < 3) {
			setError("Nama codebase harus diisi minimal 3 karakter.");
			return;
		}
		setError(null);
		setIsSubmitting(true);
		try {
			const response = await fetch("/api/codebases", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: trimmed }),
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
					"name" in body && typeof body.name === "string" ? body.name : trimmed,
			});
			setPayload(sync.data);
			setAgentStarted(false);
			setSessionNonce((current) => current + 1);
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			setIsSubmitting(false);
		}
	};

	const retrySession = async () => {
		if (!codebase) return;
		setError(null);
		setIsSubmitting(true);
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
			setAgentStarted(false);
			setSessionNonce((current) => current + 1);
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			setIsSubmitting(false);
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
					Beri nama repository, salin prompt sync ke AI coding agent, lalu
					pantau status koneksi sampai snapshot terverifikasi.
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

			{!codebase ? (
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void createCodebase();
					}}
					className="rounded-xl border border-graphite bg-charcoal p-5 sm:p-6"
				>
					<label
						htmlFor="codebase-name"
						className="text-sm font-medium text-snow"
					>
						Nama repository
					</label>
					<div className="mt-3 flex flex-col gap-3 sm:flex-row">
						<input
							id="codebase-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Contoh: Aplikasi marketplace"
							className="min-h-11 min-w-0 flex-1 rounded-lg border border-graphite bg-obsidian px-3 text-sm text-snow outline-none placeholder:text-slate focus-visible:ring-2 focus-visible:ring-indigo"
						/>
						<button
							type="submit"
							disabled={isSubmitting || name.trim().length < 3}
							className="min-h-11 rounded-md bg-snow px-4 text-sm font-semibold text-onyx disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							{isSubmitting ? "Membuat..." : "Hubungkan"}
						</button>
					</div>
					<p className="mt-3 text-xs text-fog">
						Nama minimal 3 karakter. Sesi sync pertama dibuat otomatis bersama
						codebase.
					</p>
				</form>
			) : (
				<section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-graphite bg-charcoal p-5 sm:p-6">
					<div>
						<p className="font-mono text-xs uppercase tracking-widest text-fog">
							Codebase / {codebase.name}
						</p>
						<p className="mt-1 text-sm text-fog">
							Sesi sync aktif. Lanjutkan di halaman detail untuk review analisis
							dan perencanaan fitur.
						</p>
					</div>
					<Link
						to="/codebases/$id"
						params={{ id: codebase.id }}
						className="inline-flex min-h-11 items-center rounded-md border border-graphite px-4 text-sm font-semibold text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Buka detail codebase
					</Link>
				</section>
			)}

			{codebase && (
				<ScreenConnect
					projectName={codebase.name}
					payload={payload}
					isStarting={isSubmitting}
					onAgentStarted={() => setAgentStarted(true)}
				/>
			)}

			{codebase && agentStarted && (
				<SyncStatus
					key={sessionNonce}
					projectId={codebase.id}
					projectName={codebase.name}
					statusPath={`/api/codebases/${encodeURIComponent(codebase.id)}/status`}
					onRetrySync={() => void retrySession()}
					onBackToInstructions={() => setAgentStarted(false)}
					onViewReview={() =>
						void navigate({
							to: "/codebases/$id",
							params: { id: codebase.id },
						})
					}
				/>
			)}
		</main>
	);
}
