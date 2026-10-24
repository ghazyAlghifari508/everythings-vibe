import {
	InformationCircleIcon,
	MonitorIcon,
	SmartphoneIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/ui/icon";
import type { useUserPlan } from "@/features/billing/hooks/use-user-plan";
import { cn } from "@/lib/utils";
import { PLAN_CREDITS } from "@/types/database";
import type { HomeProjectMode } from "./chat-input-routing";

interface ChatInputHeaderProps {
	planData: ReturnType<typeof useUserPlan>["data"];
	projectMode: HomeProjectMode;
	isMobileMode: boolean;
	onSelectMobileMode: (mobile: boolean) => void;
}

export function ChatInputHeader({
	planData,
	projectMode,
	isMobileMode,
	onSelectMobileMode,
}: ChatInputHeaderProps) {
	return (
		<>
			{/* Top row: Credit info + Mobile/Web toggle */}
			<div className="flex items-center justify-between px-2">
				<div className="flex items-center gap-3">
					<span className="font-inter text-[12px] font-[510] text-mist">
						{!planData?.authenticated
							? `${PLAN_CREDITS.free} Kredit Gratis`
							: `Sisa ${planData.remaining} Kredit`}
					</span>
					{(!planData?.authenticated || planData.plan !== "hengker") && (
						<Link
							to="/pricing"
							className="cursor-pointer rounded-[2px] px-2 py-0.5 font-inter text-[10px] font-[510] uppercase text-fog shadow-[var(--shadow-inset)] transition-colors duration-300 hover:bg-steel/70"
						>
							Upgrade
						</Link>
					)}
				</div>

				{/* Mobile / Web Segmented Control (only for greenfield mode) */}
				{projectMode === "greenfield" && (
					<div className="flex items-center gap-0.5 rounded-md bg-charcoal p-1 shadow-[var(--shadow-inset)]">
						<button
							type="button"
							id="platform-toggle-mobile-label"
							onClick={() => onSelectMobileMode(true)}
							title="Generate PRD untuk Mobile App"
							className={cn(
								"flex items-center gap-1.5 rounded px-2.5 py-1 font-inter text-[11px] font-[510] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
								isMobileMode
									? "border border-iron/50 bg-iron text-snow"
									: "border border-transparent text-fog hover:text-snow",
							)}
						>
							<Icon icon={SmartphoneIcon} size={12} />
							App
						</button>
						<button
							type="button"
							id="platform-toggle-web"
							onClick={() => onSelectMobileMode(false)}
							title="Generate PRD untuk Web App"
							className={cn(
								"flex items-center gap-1.5 rounded px-2.5 py-1 font-inter text-[11px] font-[510] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
								!isMobileMode
									? "border border-iron/50 bg-iron text-snow"
									: "border border-transparent text-fog hover:text-snow",
							)}
						>
							<Icon icon={MonitorIcon} size={12} />
							Web
						</button>
					</div>
				)}
			</div>

			{/* Informational callout for existing codebase mode */}
			{projectMode === "existing_codebase" && (
				<div className="flex items-start gap-2.5 rounded-md border border-iron/40 bg-charcoal/80 px-3 py-2 text-left">
					<Icon
						icon={InformationCircleIcon}
						size={14}
						className="mt-0.5 shrink-0 text-mist"
					/>
					<p className="font-inter text-[12px] leading-relaxed text-fog">
						<span className="font-[510] text-mist">
							Tambahkan fitur di codebase kamu:
						</span>{" "}
						Tuliskan fitur baru atau perubahan yang ingin dibuat.
						everythings-vibe akan memandu AI agent kamu menjalankan CLI untuk
						membaca struktur aplikasi, lalu menyusun PRD, AC, dan Task yang
						presisi sesuai arsitektur yang sudah ada.
					</p>
				</div>
			)}
		</>
	);
}
