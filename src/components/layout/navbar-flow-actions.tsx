import {
	ArrowRight01Icon,
	LockIcon,
	MessageSquareIcon,
} from "@hugeicons/core-free-icons";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { loadAsk } from "@/features/greenfield/services/ask-loader.functions";
import type { WorkspaceProject } from "@/features/greenfield/services/workspace-project.server";
import { deriveWorkspaceCta } from "@/features/greenfield/utils/flow-cta";
import {
	type FlowStep,
	getFlowStepCta,
	routeToStep,
	stepToRouteTarget,
} from "@/features/greenfield/utils/flow-step";
import {
	getPendingPrdPrompt,
	savePendingPrdPrompt,
} from "@/lib/prompt-handoff";
import { useChatStore, useUIStore } from "@/store";

const CTA_CLASS =
	"btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:bg-graphite/40 disabled:text-fog/50";

type NavbarProject = Pick<
	WorkspaceProject,
	| "projectId"
	| "step"
	| "acStatus"
	| "featuresStatus"
	| "hasPrd"
	| "hasAc"
	| "hasTasks"
>;

export function NavbarFlowActions({
	pathname,
	project,
	projectId,
	isFree,
}: {
	pathname: string;
	projectId?: string;
	project: NavbarProject | null;
	isFree: boolean;
}) {
	const navigate = useNavigate();
	const router = useRouter();
	const [, startTransition] = useTransition();
	const [isStepLoading, setIsStepLoading] = useState(false);
	// State updates are async; the ref makes a double-click a no-op synchronously.
	const advancingRef = useRef(false);
	const routeStep = routeToStep(pathname);
	const askCta = getFlowStepCta(routeStep, project?.step, project?.hasPrd);
	const isGeneratingPRD = useChatStore((s) => s.isGeneratingPRD);
	const isGeneratingAC = useChatStore((s) => s.isGeneratingAC);
	const showToast = useUIStore((s) => s.showToast);
	const cta = deriveWorkspaceCta({
		route: routeStep,
		projectId: projectId ?? "",
		availability: project,
		isFree,
		op: {
			prdGenerating: isGeneratingPRD,
			acGenerating: isGeneratingAC,
			advancing: isStepLoading,
		},
	});

	const goTo = (target: FlowStep) => {
		if (!projectId) return;
		startTransition(() => {
			navigate(stepToRouteTarget(target, projectId));
		});
	};

	const advance = async (step: "ac" | "task") => {
		if (!projectId || advancingRef.current) return;
		advancingRef.current = true;
		setIsStepLoading(true);
		try {
			const res = await fetch(`/api/projects/${projectId}/step`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ step }),
			});
			if (res.status === 409) {
				// Client snapshot was ahead of persisted data: resync, do not advance.
				void router.invalidate();
				throw new Error("Tahap sebelumnya belum tersimpan.");
			}
			if (!res.ok) throw new Error("Gagal memperbarui tahap proyek");
			goTo(step);
		} catch (err) {
			console.error(`Step to ${step} failed:`, err);
			showToast(
				err instanceof Error &&
					err.message === "Tahap sebelumnya belum tersimpan."
					? err.message
					: step === "ac"
						? "Gagal lanjut ke Acceptance Criteria."
						: "Gagal lanjut ke Task.",
				"error",
			);
		} finally {
			advancingRef.current = false;
			setIsStepLoading(false);
		}
	};

	const openPrd = async () => {
		if (!projectId || advancingRef.current) return;
		advancingRef.current = true;
		setIsStepLoading(true);
		try {
			if (!getPendingPrdPrompt(projectId)) {
				const data = await loadAsk({ data: projectId });
				const prompt = data.savedHandoff?.compiledPrompt;
				if (prompt && !data.hasPrd)
					savePendingPrdPrompt(prompt, "auto", data.projectName, projectId);
			}
			await navigate({ to: "/vibeplan/$id/prd", params: { id: projectId } });
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : "Gagal memuat konteks PRD.",
				"error",
			);
		} finally {
			advancingRef.current = false;
			setIsStepLoading(false);
		}
	};

	if (!projectId) return null;
	return (
		<>
			{routeStep === "question" && askCta?.kind === "navigate" && (
				<button
					type="button"
					onClick={() => goTo(askCta.targetStep)}
					className={CTA_CLASS}
				>
					<span className="whitespace-nowrap">{askCta.label}</span>
					<Icon icon={ArrowRight01Icon} size={12} />
				</button>
			)}
			{routeStep === "prd" && (
				<button
					type="button"
					onClick={() => useUIStore.getState().toggleChatPanel()}
					className="hidden md:flex items-center gap-1.5 rounded-md bg-charcoal px-3 py-1.5 text-xs font-[510] text-fog shadow-[var(--shadow-inset)] transition-colors hover:bg-white/5 hover:text-snow"
					aria-label="Buka/tutup chat"
				>
					<Icon icon={MessageSquareIcon} size={14} />
					<span>Chat</span>
				</button>
			)}
			{cta.kind === "upgrade" &&
				(routeStep === "ac" ? (
					<Link to="/pricing" className={CTA_CLASS}>
						<span className="whitespace-nowrap">Upgrade ke Pro</span>
						<Icon icon={ArrowRight01Icon} size={12} />
					</Link>
				) : (
					<button
						type="button"
						onClick={() => useUIStore.getState().openPaywallModal("ac")}
						className={CTA_CLASS}
					>
						<Icon icon={LockIcon} size={12} className="text-amber-400" />
						<span className="whitespace-nowrap">Upgrade ke Pro</span>
						<Icon icon={ArrowRight01Icon} size={12} />
					</button>
				))}
			{cta.kind === "navigate" && (
				<button
					type="button"
					onClick={() => goTo(cta.target)}
					className={CTA_CLASS}
				>
					<span className="whitespace-nowrap">{cta.label}</span>
					<Icon icon={ArrowRight01Icon} size={12} />
				</button>
			)}
			{cta.kind === "generate" && (
				<button
					type="button"
					disabled={cta.disabled}
					title={cta.hint}
					onClick={() =>
						cta.target === "prd" ? openPrd() : advance(cta.target)
					}
					className={CTA_CLASS}
				>
					{cta.disabled && cta.busyLabel ? (
						cta.busyLabel
					) : (
						<>
							<span className="whitespace-nowrap">{cta.label}</span>
							<Icon icon={ArrowRight01Icon} size={12} />
						</>
					)}
				</button>
			)}
		</>
	);
}
