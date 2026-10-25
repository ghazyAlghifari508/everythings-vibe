import { ArrowDown01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { MAX_PROMPT_LENGTH, MIN_PROMPT_LENGTH } from "@/lib/constants";
import { type OutputLanguage, SUPPORTED_LANGUAGES } from "@/lib/language";
import { cn } from "@/lib/utils";

interface ChatInputActionsProps {
	language: OutputLanguage;
	onLanguageChange: (language: OutputLanguage) => void;
	message: string;
	isSending: boolean;
	onSend: () => void;
}

export function ChatInputActions({
	language,
	onLanguageChange,
	message,
	isSending,
	onSend,
}: ChatInputActionsProps) {
	const trimmedLength = message.trim().length;
	const isTooShort = trimmedLength > 0 && trimmedLength < MIN_PROMPT_LENGTH;
	const isTooLong = message.length > MAX_PROMPT_LENGTH;
	const isSendDisabled = !trimmedLength || isSending;

	return (
		<div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
			{/* Left side: Output language selector dropdown */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						id="output-language-selector-btn"
						title="Pilih bahasa output generasi AI"
						className="flex items-center gap-1.5 rounded-md px-2 py-1 font-inter text-[11px] font-[510] text-mist transition-all duration-200 hover:bg-steel/50 hover:text-snow focus:outline-none"
					>
						<span className="font-mono text-[10px] font-semibold text-fog">
							{language === "en" ? "EN" : "ID"}
						</span>
						<span>{language === "en" ? "English" : "Bahasa Indonesia"}</span>
						<Icon icon={ArrowDown01Icon} size={11} className="text-slate" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					side="bottom"
					className="min-w-[170px] border-steel/60 bg-obsidian/95 p-1 backdrop-blur"
				>
					{SUPPORTED_LANGUAGES.map((langOpt) => (
						<DropdownMenuItem
							key={langOpt.id}
							onClick={() => onLanguageChange(langOpt.id)}
							className={cn(
								"flex cursor-pointer items-center justify-between px-2.5 py-2 font-inter text-xs transition-colors",
								language === langOpt.id
									? "bg-steel font-[510] text-snow"
									: "text-mist hover:bg-white/5 hover:text-snow",
							)}
						>
							<span className="flex items-center gap-2">
								<span className="font-mono text-[10px] font-semibold text-fog">
									{langOpt.shortLabel}
								</span>
								<span>{langOpt.label}</span>
							</span>
							{language === langOpt.id && (
								<Icon icon={Tick01Icon} size={13} className="text-snow" />
							)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Right side: Character counter & Submit */}
			<div className="flex items-center gap-3">
				<span
					className={cn(
						"font-inter text-[12px]",
						isTooShort || isTooLong ? "text-crimson" : "text-fog",
					)}
				>
					{message.length.toLocaleString("id-ID")}/
					{MAX_PROMPT_LENGTH.toLocaleString("id-ID")}
				</span>
				<button
					type="button"
					id="hero-send-btn"
					onClick={onSend}
					disabled={isSendDisabled}
					aria-label="Kirim prompt ide produk"
					className={cn(
						"flex h-9 w-9 items-center justify-center rounded-md transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]",
						!isSendDisabled
							? "btn-primary hover:brightness-105"
							: "bg-steel/40 text-slate",
					)}
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 14 14"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
						role="img"
						aria-label="Kirim"
					>
						<title>Kirim</title>
						<path
							d="M7 11.5V2.5M7 2.5L2.5 7M7 2.5L11.5 7"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</button>
			</div>
		</div>
	);
}
