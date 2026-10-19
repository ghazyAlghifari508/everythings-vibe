"use client";

import {
	ArrowRight01Icon,
	CloudIcon,
	Database01Icon,
	Layers01Icon,
	PaletteIcon,
	Rocket01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/ui/icon";
import type { CodebaseAnalysis } from "@/features/codebase/services/analysis";
import {
	type AskHandoffState,
	type AskQuestion,
	type TechAnswers,
	useAskSession,
} from "@/features/greenfield/hooks/use-ask-session";
import { submitAskHandoff } from "@/features/greenfield/services/ask-handoff";
import {
	getFlowStepCta,
	stepToRouteTarget,
} from "@/features/greenfield/utils/flow-step";
import {
	BACKEND_OPTIONS,
	DATABASE_OPTIONS,
	DEPLOYMENT_MOBILE_OPTIONS,
	DEPLOYMENT_OPTIONS,
	FRONTEND_MOBILE_OPTIONS,
	FRONTEND_WEB_OPTIONS,
	FULLSTACK_FRAMEWORK_OPTIONS,
	FULLSTACK_MOBILE_OPTIONS,
} from "@/features/greenfield/utils/stack-data";
import { useUIStore } from "@/store";
import { type NonTechAnswer, QuestionCard } from "./question-card";
import { StackDropdown } from "./stack-dropdown";

interface AskFlowProps {
	projectId: string;
	projectName: string;
	/** Existing-codebase projects persist the Ask handoff server-side.
	 *  Absent/unknown behaves as greenfield (sessionStorage only). */
	projectMode?: string | null;
	analysis?: CodebaseAnalysis | null;
	initialHandoff?: AskHandoffState | null;
	step?: string | null;
	hasPrd?: boolean;
}

export function AskFlow({
	projectId,
	projectName,
	projectMode: _projectMode,
	analysis,
	initialHandoff,
	step,
	hasPrd,
}: AskFlowProps) {
	const navigate = useNavigate();
	const showToast = useUIStore((s) => s.showToast);

	const flowCta = getFlowStepCta("question", step, hasPrd);
	const isNavigateOnly = flowCta?.kind === "navigate";

	const handleReturnToStage = () => {
		const targetStep = flowCta?.targetStep ?? "prd";
		navigate(stepToRouteTarget(targetStep, projectId));
	};

	const {
		autosaveCtrl,
		isLoadingQuestions,
		loadError,
		nonTechAnswers,
		platform,
		promptRef,
		questions,
		session,
		setNonTechAnswers,
		setSession,
		setTechAnswers,
		skippedTech,
		techAnswers,
		toggleSkipTech,
	} = useAskSession({ projectId, projectName, analysis, initialHandoff });

	const fullstackDisabled = Boolean(
		techAnswers.frontend ||
			techAnswers.backend ||
			skippedTech.has("frontend") ||
			skippedTech.has("backend"),
	);
	const feBeDisabled = Boolean(
		techAnswers.fullstackFramework || skippedTech.has("fullstackFramework"),
	);
	const frontendOptions =
		platform === "mobile" ? FRONTEND_MOBILE_OPTIONS : FRONTEND_WEB_OPTIONS;
	const fullstackOptions =
		platform === "mobile"
			? FULLSTACK_MOBILE_OPTIONS
			: FULLSTACK_FRAMEWORK_OPTIONS;
	const deploymentOptions =
		platform === "mobile" ? DEPLOYMENT_MOBILE_OPTIONS : DEPLOYMENT_OPTIONS;

	const answeredCount = Object.values(nonTechAnswers).filter(
		(a) => a.value || a.skipped,
	).length;
	const allNonTechAnswered =
		questions.length > 0 &&
		questions.every((q) => {
			const a = nonTechAnswers[q.id];
			return a && (a.value || a.skipped);
		});
	// ponytail: every tech field is skippable: Lewati = undefined = "Biarkan AI
	// yang memilih" in submit(). No field is mandatory; Generate PRD stays enabled
	// so non-technical users can let the AI pick the whole stack.
	const allTechAnswered = true;

	const submit = async (tech: TechAnswers) => {
		await submitAskHandoff({
			projectId,
			projectName,
			platform,
			session,
			prompt: promptRef.current,
			questions,
			nonTechAnswers,
			techAnswers: tech,
			skippedTech,
			autosaveCtrl,
			showToast,
		});
		navigate({ to: "/fitur/$id", params: { id: projectId } });
	};

	if (isLoadingQuestions) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 bg-onyx">
				<div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
				<p className="font-inter text-sm text-fog">Menyusun pertanyaan...</p>
			</div>
		);
	}

	if (loadError || questions.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
				<p className="font-inter text-fog">
					{loadError || "Gagal memuat pertanyaan."}
				</p>
				<button
					type="button"
					onClick={() => navigate({ to: "/" })}
					className="btn-primary rounded-md px-4 py-2 min-h-[44px] inline-flex items-center justify-center font-inter text-sm"
				>
					Kembali ke Home
				</button>
			</div>
		);
	}

	return (
		<div className="hide-scrollbar mx-auto flex-1 w-full overflow-y-auto bg-onyx min-h-0">
			<div className="mx-auto max-w-3xl lg:max-w-4xl px-4 sm:px-6 py-6 sm:py-12">
				<div className="mb-8 flex items-center justify-between">
					<div>
						<p className="font-inter text-xs uppercase tracking-wide text-fog">
							Sesi {session} dari 2
						</p>
						<h1
							className="font-inter text-2xl font-[510]"
							style={{ color: "var(--text-primary)" }}
						>
							{session === 1 ? "Ceritakan lebih lanjut" : "Preferensi Teknis"}
						</h1>
					</div>
					{session === 1 && (
						<span className="font-inter text-sm text-fog">
							{answeredCount}/{questions.length}
						</span>
					)}
				</div>

				{session === 1 ? (
					<div className="space-y-4 pb-8">
						<p className="font-inter text-xs text-fog italic">
							Pilih &ldquo;Lewati&rdquo; jika tidak yakin, AI akan menentukan
							yang terbaik berdasarkan kebutuhan aplikasi Anda.
						</p>
						{questions.map((q: AskQuestion) => (
							<QuestionCard
								key={q.id}
								question={q.question}
								type={q.type}
								options={q.options}
								answer={nonTechAnswers[q.id]}
								onAnswer={(answer: NonTechAnswer) =>
									setNonTechAnswers((prev) => ({ ...prev, [q.id]: answer }))
								}
							/>
						))}
						<div className="flex justify-end pt-2">
							<button
								type="button"
								disabled={!allNonTechAnswered}
								onClick={() => setSession(2)}
								className="btn-primary rounded-md px-6 py-2.5 min-h-[44px] inline-flex items-center justify-center font-inter text-sm font-[510] disabled:opacity-40 disabled:cursor-not-allowed"
							>
								Lanjut
							</button>
						</div>
					</div>
				) : (
					<div className="space-y-6 pb-8">
						{analysis ? (
							<div className="flex items-start gap-3 rounded-xl border border-graphite bg-card p-4 shadow-sm text-card-foreground">
								<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 mt-0.5">
									<Icon icon={Tick01Icon} size={14} strokeWidth={2.5} />
								</div>
								<div className="flex flex-col gap-0.5">
									<span className="text-xs font-semibold text-snow">
										Tech stack otomatis terdeteksi (
										{analysis.framework ||
											analysis.language ||
											"Existing Codebase"}
										)
									</span>
									<span className="text-xs text-fog leading-relaxed">
										Pilihan di bawah telah terisi otomatis sesuai arsitektur
										repositori kamu dan siap digunakan, atau dapat kamu
										sesuaikan bila diperlukan.
									</span>
								</div>
							</div>
						) : (
							<p className="font-inter text-xs text-fog italic">
								Pilih &ldquo;Gunakan Rekomendasi AI&rdquo; jika tidak yakin, AI
								akan memilih stack yang paling sesuai untuk aplikasi Anda.
							</p>
						)}
						<div className="grid gap-4 sm:grid-cols-2">
							<StackDropdown
								label="Frontend"
								subtitle="UI & tampilan user"
								icon={PaletteIcon}
								accent="#5e6ad2"
								placeholder="Pilih frontend..."
								options={frontendOptions}
								value={techAnswers.frontend}
								disabled={feBeDisabled}
								skipped={skippedTech.has("frontend")}
								allowSkip
								onChange={(v) =>
									setTechAnswers((prev) => ({ ...prev, frontend: v }))
								}
								onToggleSkip={() => toggleSkipTech("frontend")}
							/>
							<StackDropdown
								label="Backend"
								subtitle="Logic & API server"
								icon={CloudIcon}
								accent="#2dd4a7"
								placeholder="Pilih backend..."
								options={BACKEND_OPTIONS}
								value={techAnswers.backend}
								disabled={feBeDisabled}
								skipped={skippedTech.has("backend")}
								allowSkip
								onChange={(v) =>
									setTechAnswers((prev) => ({ ...prev, backend: v }))
								}
								onToggleSkip={() => toggleSkipTech("backend")}
							/>
							<StackDropdown
								label={
									platform === "mobile"
										? "Mobile + Backend"
										: "Fullstack Framework"
								}
								subtitle={
									platform === "mobile"
										? "Mobile FE + backend jadi satu"
										: "Frontend + backend jadi satu"
								}
								icon={Layers01Icon}
								accent="#e879a6"
								placeholder="Pilih framework..."
								options={fullstackOptions}
								value={techAnswers.fullstackFramework}
								disabled={fullstackDisabled}
								skipped={skippedTech.has("fullstackFramework")}
								allowSkip
								onChange={(v) =>
									setTechAnswers((prev) => ({ ...prev, fullstackFramework: v }))
								}
								onToggleSkip={() => toggleSkipTech("fullstackFramework")}
							/>
							<StackDropdown
								label="Database"
								subtitle="Penyimpanan data"
								icon={Database01Icon}
								accent="#f5b544"
								placeholder="Pilih database..."
								options={DATABASE_OPTIONS}
								value={techAnswers.database}
								disabled={false}
								skipped={skippedTech.has("database")}
								allowSkip
								onChange={(v) =>
									setTechAnswers((prev) => ({ ...prev, database: v }))
								}
								onToggleSkip={() => toggleSkipTech("database")}
							/>
							<StackDropdown
								label="Deployment"
								subtitle="Hosting & infra"
								icon={Rocket01Icon}
								accent="#a78bfa"
								placeholder="Pilih platform..."
								options={deploymentOptions}
								value={techAnswers.deployment}
								disabled={false}
								skipped={skippedTech.has("deployment")}
								allowSkip
								dropUp
								onChange={(v) =>
									setTechAnswers((prev) => ({ ...prev, deployment: v }))
								}
								onToggleSkip={() => toggleSkipTech("deployment")}
							/>
						</div>

						<div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--border-subtle) pt-6">
							<button
								type="button"
								onClick={() => setSession(1)}
								className="font-inter text-sm text-fog hover:text-snow"
							>
								Kembali
							</button>
							{isNavigateOnly ? (
								<button
									type="button"
									onClick={handleReturnToStage}
									className="btn-primary flex items-center gap-1.5 rounded-md px-6 py-2.5 font-inter text-sm font-[510] transition-all hover:brightness-105 active:scale-[0.98]"
								>
									<span>{flowCta?.label}</span>
									<Icon icon={ArrowRight01Icon} size={14} />
								</button>
							) : (
								<button
									type="button"
									disabled={!allTechAnswered}
									onClick={() => void submit(techAnswers)}
									className="btn-primary rounded-md px-6 py-2.5 font-inter text-sm font-[510] disabled:opacity-40 disabled:cursor-not-allowed"
								>
									Lihat Fitur
								</button>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
