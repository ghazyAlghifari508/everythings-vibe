"use client";

import {
	Cancel01Icon,
	CreditCardIcon,
	Logout01Icon,
	Menu01Icon,
	MessageSquareIcon,
	Settings01Icon,
	Shield01Icon,
	UserIcon,
} from "@hugeicons/core-free-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
	Link,
	useLocation,
	useMatches,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { canShowNavbarTopUp } from "@/components/layout/navbar-topup-helper";
import { Icon } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { TopUpModal } from "@/features/billing/components/top-up-modal";
import { useUserPlan } from "@/features/billing/hooks/use-user-plan";
import { authClient } from "@/lib/auth-client";
import { historyFilterSchema } from "@/lib/history";
import { isAdmin } from "@/lib/session";
import { useUIStore } from "@/store";
import { CodebaseStepNav, FlowStepNav, routeToStep } from "./flow-step-nav";
import { NavbarFlowActions } from "./navbar-flow-actions";
import { NavbarProductLinks } from "./navbar-product-links";

export function Navbar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
	const { data: session, isPending: isLoading } = authClient.useSession();
	const user =
		session?.user?.id && session.user.email
			? { id: session.user.id, email: session.user.email }
			: null;
	const queryClient = useQueryClient();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const [isTopUpOpen, setIsTopUpOpen] = useState(false);
	const router = useRouter();
	const navigate = useNavigate();
	const pathname = useLocation({ select: (l) => l.pathname });
	const routeSearch = useLocation({ select: (l) => l.search });
	const historyWorkspace =
		historyFilterSchema.safeParse(routeSearch).data?.workspace;
	const isGreenfieldWorkspace =
		pathname === "/plan/new" ||
		(pathname === "/history" && historyWorkspace === "greenfield");
	const routeStep = routeToStep(pathname);
	const projectNavData = useMatches({
		select: (matches) => {
			for (let i = matches.length - 1; i >= 0; i--) {
				const data = matches[i].loaderData as
					| {
							projectName?: string;
							step?: string | null;
							taskStatus?: string | null;
							acStatus?: string | null;
							featuresStatus?: string | null;
							latestAcContent?: string | null;
							hasAc?: boolean;
					  }
					| undefined;
				if (
					data &&
					(typeof data.projectName === "string" ||
						typeof data.step === "string" ||
						typeof data.taskStatus === "string" ||
						typeof data.acStatus === "string" ||
						typeof data.featuresStatus === "string" ||
						typeof data.latestAcContent === "string" ||
						typeof data.hasAc === "boolean" ||
						data.step === null)
				) {
					return {
						projectName: data.projectName ?? null,
						step: data.step ?? null,
						taskStatus: data.taskStatus ?? null,
						acStatus: data.acStatus ?? null,
						featuresStatus: data.featuresStatus ?? null,
						hasAc: Boolean(
							data.latestAcContent ||
								data.hasAc ||
								data.acStatus === "completed",
						),
					};
				}
			}
			return null;
		},
	});
	const { data: planData } = useUserPlan();
	const isFree = (planData?.plan ?? "free") === "free";
	const isFlowStepRoute =
		pathname.startsWith("/ask/") ||
		pathname.startsWith("/fitur/") ||
		pathname.startsWith("/prd/") ||
		pathname.startsWith("/ac/") ||
		pathname.startsWith("/task/") ||
		pathname.startsWith("/kanban/");
	const isCodebaseSyncRoute = pathname === "/plan/codebase";
	const codebasePlanStep = useUIStore((s) => s.codebasePlanStep);
	const setCodebasePlanStep = useUIStore((s) => s.setCodebasePlanStep);
	const showToast = useUIStore((s) => s.showToast);
	const projectId = pathname.split("/")[2];

	const handleLogout = async () => {
		try {
			await authClient.signOut();
			// The router survives logout, so its user-scoped cache must not reach the next session.
			queryClient.clear();
			navigate({ to: "/login" });
			router.invalidate();
		} catch (err) {
			console.error("[navbar] logout failed", err);
			showToast("Gagal logout. Coba lagi.", "error");
		}
	};
	const isTopUpEligible = canShowNavbarTopUp({
		user,
		plan: planData?.plan,
		topUpEligible: planData?.topUpEligible,
	});
	const topUpButton = isTopUpEligible ? (
		<button
			type="button"
			onClick={() => setIsTopUpOpen(true)}
			aria-label="Isi ulang kredit"
			className="flex h-8 items-center gap-1.5 rounded-md border border-graphite bg-transparent px-2.5 font-inter text-xs font-[510] text-fog transition-colors hover:border-fog/50 hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fog/40"
		>
			<Icon icon={CreditCardIcon} size={13} aria-hidden />
			<span>Top Up</span>
		</button>
	) : null;

	return (
		<nav className="fixed left-0 right-0 top-0 z-40 h-14 border-b border-graphite bg-charcoal/95">
			<div className="mx-auto flex h-full max-w-[1200px] items-center px-6">
				<div className="flex items-center gap-2.5 shrink-0 md:w-[220px]">
					{routeStep === "task" && projectId && (
						<button
							type="button"
							onClick={() => useUIStore.getState().setProjectDrawerOpen(true)}
							className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-graphite/60 bg-transparent text-fog transition-colors hover:border-steel hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							aria-label="Menu dokumen proyek"
							title="Dokumen Proyek"
						>
							<Icon icon={Menu01Icon} size={16} />
						</button>
					)}
					{user && pathname === "/" && (
						<button
							type="button"
							onClick={onOpenDrawer}
							className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-graphite/60 bg-transparent text-fog transition-colors hover:border-steel hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							aria-label="Riwayat"
							title="Riwayat Proyek"
						>
							<Icon icon={Menu01Icon} size={16} />
						</button>
					)}
					<Logo height={28} />
				</div>
				{isCodebaseSyncRoute ? (
					<div className="flex md:hidden flex-1 items-center justify-center">
						<CodebaseStepNav
							step={codebasePlanStep}
							onSelectStep={setCodebasePlanStep}
						/>
					</div>
				) : isFlowStepRoute ? (
					<div className="flex md:hidden flex-1 items-center justify-center">
						<FlowStepNav
							step={projectNavData?.step}
							taskStatus={projectNavData?.taskStatus}
						/>
					</div>
				) : null}
				<div className="hidden md:flex flex-1 items-center justify-center">
					{isCodebaseSyncRoute ? (
						<CodebaseStepNav
							step={codebasePlanStep}
							onSelectStep={setCodebasePlanStep}
						/>
					) : isFlowStepRoute ? (
						<FlowStepNav
							step={projectNavData?.step}
							taskStatus={projectNavData?.taskStatus}
						/>
					) : (
						<div className="flex items-center gap-1">
							<NavbarProductLinks
								pathname={pathname}
								isGreenfieldWorkspace={isGreenfieldWorkspace}
							/>
						</div>
					)}
				</div>
				<div className="flex md:w-[220px] shrink-0 items-center justify-end gap-2 ml-auto md:ml-0">
					{!isFlowStepRoute && !isCodebaseSyncRoute && (
						<button
							type="button"
							className="md:hidden p-2 text-fog hover:text-snow transition-colors shrink-0"
							onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
							aria-label="Toggle menu"
							aria-expanded={isMobileMenuOpen}
						>
							{isMobileMenuOpen ? (
								<Icon icon={Cancel01Icon} size={20} />
							) : (
								<Icon icon={Menu01Icon} size={20} />
							)}
						</button>
					)}
					{isFlowStepRoute && (
						<NavbarFlowActions
							pathname={pathname}
							project={projectNavData}
							isFree={isFree}
						/>
					)}
					{isCodebaseSyncRoute && (
						<Link
							to="/codebases"
							className="flex h-8 items-center rounded-md border border-graphite px-2.5 text-xs font-[510] text-fog transition-colors hover:border-fog/50 hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Project Tersimpan
						</Link>
					)}
					{isCodebaseSyncRoute && topUpButton}
					{!isFlowStepRoute && !isCodebaseSyncRoute && (
						<div className="hidden md:flex items-center gap-2">
							{topUpButton}
							<ThemeToggle />
							{isLoading ? (
								<div className="ml-1 flex items-center gap-2 sm:gap-3">
									<div className="h-8 w-[72px] animate-pulse rounded-md bg-white/5" />
									<div className="h-8 w-[84px] animate-pulse rounded-md bg-white/5" />
								</div>
							) : !user ? (
								<Link
									to="/login"
									className="btn-primary flex h-8 items-center justify-center rounded-md px-4 font-inter text-sm font-[510] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:brightness-105 active:scale-[0.98]"
								>
									Log In
								</Link>
							) : (
								<div className="relative">
									<button
										type="button"
										onClick={() => setIsDropdownOpen(!isDropdownOpen)}
										aria-label="User menu"
										aria-haspopup="true"
										aria-expanded={isDropdownOpen}
										className="flex h-8 w-8 items-center justify-center rounded-full bg-obsidian text-fog shadow-[var(--shadow-inset)] transition-colors duration-300 hover:text-snow"
									>
										<Icon icon={UserIcon} size={16} />
									</button>
									{isDropdownOpen && (
										<>
											<button
												type="button"
												aria-label="Tutup menu pengguna"
												className="fixed inset-0 z-40 cursor-default bg-transparent border-0"
												onClick={() => setIsDropdownOpen(false)}
											/>
											<div className="absolute right-0 top-full z-50 mt-2 flex w-56 flex-col overflow-hidden rounded-xl bg-obsidian py-2 font-inter shadow-[var(--shadow-overlay)]">
												<div className="px-4 py-2 mb-1">
													<p className="truncate text-sm font-[510] text-snow">
														{user.email}
													</p>
												</div>
												<div className="mb-1 h-px w-full bg-graphite" />
												<Link
													to="/settings/profile"
													onClick={() => setIsDropdownOpen(false)}
													className="flex items-center gap-3 px-4 py-2.5 text-sm font-[510] text-mist transition-colors hover:bg-white/5 hover:text-snow"
												>
													<Icon
														icon={Settings01Icon}
														size={16}
														className="text-fog"
													/>
													Setting
												</Link>
												{session?.user && isAdmin(session.user) && (
													<Link
														to="/admin"
														onClick={() => setIsDropdownOpen(false)}
														className="flex items-center gap-3 px-4 py-2.5 text-sm font-[510] text-mist transition-colors hover:bg-white/5 hover:text-snow"
													>
														<Icon
															icon={Shield01Icon}
															size={16}
															className="text-fog"
														/>
														Admin
													</Link>
												)}
												<Link
													to="/settings/feedback"
													onClick={() => setIsDropdownOpen(false)}
													className="flex items-center gap-3 px-4 py-2.5 text-sm font-[510] text-mist transition-colors hover:bg-white/5 hover:text-snow"
												>
													<Icon
														icon={MessageSquareIcon}
														size={16}
														className="text-fog"
													/>
													Bantuan &amp; Feedback
												</Link>
												<div className="my-1 h-px w-full bg-graphite" />
												<button
													type="button"
													onClick={() => {
														setIsDropdownOpen(false);
														handleLogout();
													}}
													className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-[510] text-crimson transition-colors hover:bg-crimson/10"
												>
													<Icon icon={Logout01Icon} size={16} />
													Log Out
												</button>
											</div>
										</>
									)}
								</div>
							)}
						</div>
					)}
				</div>
			</div>
			{isMobileMenuOpen && !isCodebaseSyncRoute && !isFlowStepRoute && (
				<div className="md:hidden border-t border-graphite bg-obsidian px-6 py-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
					<div className="flex items-center justify-between">
						<span className="text-sm font-[510] text-fog">Tampilan</span>
						<div className="flex items-center gap-2">
							{topUpButton}
							<ThemeToggle />
						</div>
					</div>
					<NavbarProductLinks
						pathname={pathname}
						isGreenfieldWorkspace={isGreenfieldWorkspace}
						mobile
						onNavigate={() => setIsMobileMenuOpen(false)}
					/>
				</div>
			)}
			<TopUpModal open={isTopUpOpen} onOpenChange={setIsTopUpOpen} />
		</nav>
	);
}
