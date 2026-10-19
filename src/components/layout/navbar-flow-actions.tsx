import {
	ArrowRight01Icon,
	LockIcon,
	MessageSquareIcon,
} from "@hugeicons/core-free-icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import {
	getPendingPrdPrompt,
	getSetupPrompt,
	savePendingPrdPrompt,
} from "@/lib/prompt-handoff";
import { useChatStore, useUIStore } from "@/store";
import {
	getFlowStepCta,
	routeToStep,
	stepToRouteTarget,
} from "./flow-step-nav";

export function NavbarFlowActions({
	pathname,
	project,
	isFree,
}: {
	pathname: string;
	project: {
		projectName: string | null;
		step: string | null;
		acStatus: string | null;
		featuresStatus: string | null;
		hasAc: boolean;
	} | null;
	isFree: boolean;
}) {
	const navigate = useNavigate();
	const [, startTransition] = useTransition();
	const [isStepLoading, setIsStepLoading] = useState(false);
	const routeStep = routeToStep(pathname);
	const projectId = pathname.split("/")[2];
	const flowCta = getFlowStepCta(routeStep, project?.step);
	const isGeneratingPRD = useChatStore((s) => s.isGeneratingPRD);
	const hasStreamingPRDContent = useChatStore((s) => !!s.streamingPRDContent);
	const isGeneratingAC = useChatStore((s) => s.isGeneratingAC);
	const showToast = useUIStore((s) => s.showToast);
	const isGeneratingFeatures =
		routeStep === "fitur" && project?.featuresStatus === "generating";
	const acPending = !project?.hasAc && project?.acStatus !== "completed";

	const advance = async (step: "ac" | "task") => {
		if (!projectId || isStepLoading) return;
		if (step === "task" && routeStep === "ac" && acPending) {
			showToast("AC belum selesai digenerate. Tunggu hingga selesai.", "error");
			return;
		}
		setIsStepLoading(true);
		try {
			const res = await fetch(`/api/projects/${projectId}/step`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ step }),
			});
			if (!res.ok) throw new Error("Gagal memperbarui tahap proyek");
			startTransition(() => {
				navigate(stepToRouteTarget(step, projectId));
			});
		} catch (err) {
			console.error(`Step to ${step} failed:`, err);
			showToast(
				step === "ac"
					? "Gagal lanjut ke Acceptance Criteria."
					: "Gagal lanjut ke Task.",
				"error",
			);
		} finally {
			setIsStepLoading(false);
		}
	};

	if (!projectId) return null;
	return (
		<>
			{routeStep === "question" && flowCta?.kind === "navigate" && (
				<button
					type="button"
					onClick={() =>
						startTransition(() => {
							navigate(stepToRouteTarget(flowCta.targetStep, projectId));
						})
					}
					className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98]"
				>
					<span className="whitespace-nowrap">{flowCta.label}</span>
					<Icon icon={ArrowRight01Icon} size={12} />
				</button>
			)}
			{routeStep === "fitur" && (
				<button
					type="button"
					disabled={isGeneratingFeatures || isStepLoading}
					title={
						isGeneratingFeatures
							? "Daftar fitur masih disusun. Tunggu hingga selesai."
							: "Lanjut ke PRD"
					}
					onClick={() => {
						if (isGeneratingFeatures || isStepLoading) return;
						if (!getPendingPrdPrompt()) {
							const setup = getSetupPrompt();
							if (setup)
								savePendingPrdPrompt(
									setup,
									"auto",
									project?.projectName ?? undefined,
								);
						}
						startTransition(() => {
							navigate({ to: "/prd/$id", params: { id: projectId } });
						});
					}}
					className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:bg-graphite/40 disabled:text-fog/50"
				>
					{isGeneratingFeatures ? (
						"Menyusun fitur..."
					) : (
						<>
							<span className="whitespace-nowrap">Generate PRD</span>
							<Icon icon={ArrowRight01Icon} size={12} />
						</>
					)}
				</button>
			)}
			{routeStep === "prd" && (
				<>
					<button
						type="button"
						onClick={() => useUIStore.getState().toggleChatPanel()}
						className="hidden md:flex items-center gap-1.5 rounded-md bg-charcoal px-3 py-1.5 text-xs font-[510] text-fog shadow-[var(--shadow-inset)] transition-colors hover:bg-white/5 hover:text-snow"
						aria-label="Buka/tutup chat"
					>
						<Icon icon={MessageSquareIcon} size={14} />
						<span>Chat</span>
					</button>
					{isFree ? (
						<button
							type="button"
							onClick={() => useUIStore.getState().openPaywallModal("ac")}
							className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98]"
						>
							<Icon icon={LockIcon} size={12} className="text-amber-400" />
							<span className="whitespace-nowrap">Upgrade ke Pro</span>
							<Icon icon={ArrowRight01Icon} size={12} />
						</button>
					) : flowCta?.kind === "navigate" ? (
						<button
							type="button"
							onClick={() =>
								startTransition(() => {
									navigate(stepToRouteTarget(flowCta.targetStep, projectId));
								})
							}
							className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98]"
						>
							<span className="whitespace-nowrap">{flowCta.label}</span>
							<Icon icon={ArrowRight01Icon} size={12} />
						</button>
					) : (
						<button
							type="button"
							onClick={() => advance("ac")}
							disabled={
								isStepLoading || isGeneratingPRD || hasStreamingPRDContent
							}
							className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:bg-graphite/40 disabled:text-fog/50"
						>
							{isStepLoading ? (
								"Memuat..."
							) : (
								<>
									<span>Generate AC</span>
									<Icon icon={ArrowRight01Icon} size={12} />
								</>
							)}
						</button>
					)}
				</>
			)}
			{routeStep === "ac" &&
				(isFree ? (
					<Link
						to="/pricing"
						className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98]"
					>
						<span className="whitespace-nowrap">Upgrade ke Pro</span>
						<Icon icon={ArrowRight01Icon} size={12} />
					</Link>
				) : flowCta?.kind === "navigate" ? (
					<button
						type="button"
						onClick={() =>
							startTransition(() => {
								navigate({ to: "/task/$id", params: { id: projectId } });
							})
						}
						className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98]"
					>
						<span className="whitespace-nowrap">{flowCta.label}</span>
						<Icon icon={ArrowRight01Icon} size={12} />
					</button>
				) : (
					<button
						type="button"
						onClick={() => advance("task")}
						disabled={
							isStepLoading ||
							isGeneratingAC ||
							isGeneratingPRD ||
							hasStreamingPRDContent ||
							acPending
						}
						className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:bg-graphite/40 disabled:text-fog/50"
					>
						{isStepLoading ||
						isGeneratingAC ||
						isGeneratingPRD ||
						hasStreamingPRDContent ||
						acPending ? (
							isGeneratingAC || acPending ? (
								"Menyusun AC..."
							) : (
								"Memuat..."
							)
						) : (
							<>
								<span>Generate Task</span>
								<Icon icon={ArrowRight01Icon} size={12} />
							</>
						)}
					</button>
				))}
		</>
	);
}
