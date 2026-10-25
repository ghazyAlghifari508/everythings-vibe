import { Add01Icon, FolderGitIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
	HOME_PROJECT_MODE_OPTIONS,
	type HomeProjectMode,
} from "./chat-input-routing";

interface ChatInputModeSelectorProps {
	projectMode: HomeProjectMode;
	onModeChange: (mode: HomeProjectMode) => void;
}

export function ChatInputModeSelector({
	projectMode,
	onModeChange,
}: ChatInputModeSelectorProps) {
	return (
		<div className="flex items-center gap-1 rounded-lg bg-charcoal p-1 shadow-[var(--shadow-inset)]">
			{HOME_PROJECT_MODE_OPTIONS.map((option) => {
				const active = projectMode === option.id;
				const modeIcon = option.id === "greenfield" ? Add01Icon : FolderGitIcon;
				return (
					<button
						key={option.id}
						type="button"
						id={
							option.id === "greenfield"
								? "home-mode-greenfield"
								: "home-mode-existing-codebase"
						}
						onClick={() => onModeChange(option.id)}
						title={
							option.id === "greenfield"
								? "Buat PRD dari ide produk baru"
								: "Rencanakan fitur untuk codebase yang sudah ada"
						}
						aria-pressed={active}
						className={cn(
							"flex items-center gap-1.5 rounded-md px-3 py-1.5 font-inter text-[12px] font-[510] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] cursor-pointer",
							active
								? "border border-iron/50 bg-iron text-snow shadow-sm"
								: "border border-transparent text-fog hover:text-snow",
						)}
					>
						<Icon icon={modeIcon} size={13} />
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
