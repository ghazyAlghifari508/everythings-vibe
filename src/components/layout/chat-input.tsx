import { CreditExhaustedModal } from "@/features/billing/components/credit-exhausted-modal";
import { MAX_PROMPT_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ChatInputActions } from "./chat-input/chat-input-actions";
import { ChatInputHeader } from "./chat-input/chat-input-header";
import { ChatInputModeSelector } from "./chat-input/chat-input-mode-selector";
import {
	type ChatInputProps,
	GREENFIELD_PLACEHOLDER_EN,
	GREENFIELD_PLACEHOLDER_ID,
} from "./chat-input/chat-input-routing";
import { useHomeProjectCreation } from "./chat-input/use-home-project-creation";

export {
	type ChatInputProps,
	decideHomePostCreationTarget,
	HOME_PROJECT_MODE_OPTIONS,
	type HomePostCreationTarget,
	type HomeProjectMode,
	shouldBlockProjectCreationOnCredits,
} from "./chat-input/chat-input-routing";

export function ChatInput({
	className,
	initialValue,
	initialMobile,
	prefillKey,
	onModeChange,
	hideModeSelector,
}: ChatInputProps) {
	const {
		message,
		setMessage,
		focused,
		setFocused,
		isMobileMode,
		setIsMobileMode,
		projectMode,
		language,
		promptError,
		creditsExhaustedMsg,
		setCreditsExhaustedMsg,
		isSending,
		planData,
		handleModeChange,
		handleLanguageChange,
		handleSend,
	} = useHomeProjectCreation({
		initialValue,
		initialMobile,
		prefillKey,
		onModeChange,
	});

	const greenfieldPlaceholder =
		language === "en" ? GREENFIELD_PLACEHOLDER_EN : GREENFIELD_PLACEHOLDER_ID;

	return (
		<>
			<div className="mx-auto flex w-full max-w-[728px] flex-col items-center gap-3">
				{/* Project mode selector: Produk baru | Codebase existing (di atas box chat) */}
				{!hideModeSelector && (
					<ChatInputModeSelector
						projectMode={projectMode}
						onModeChange={handleModeChange}
					/>
				)}

				{/* Main chat box */}
				<div
					className={cn(
						"flex w-full flex-col rounded-xl bg-charcoal p-1.5 shadow-[var(--shadow-surface)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
						focused ? "shadow-[var(--shadow-focus)]" : "",
						className,
					)}
				>
					<div className="flex flex-1 flex-col gap-3 rounded-[10px] bg-obsidian p-4">
						<ChatInputHeader
							planData={planData}
							projectMode={projectMode}
							isMobileMode={isMobileMode}
							onSelectMobileMode={setIsMobileMode}
						/>

						{/* Main input area */}
						<div className="relative flex flex-col rounded-md bg-charcoal shadow-[var(--shadow-inset)] transition-shadow duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-within:shadow-[var(--shadow-focus)]">
							<textarea
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								onFocus={() => setFocused(true)}
								onBlur={() => setFocused(false)}
								maxLength={MAX_PROMPT_LENGTH}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										handleSend();
									}
								}}
								placeholder={
									projectMode === "existing_codebase"
										? language === "en"
											? "Describe the feature you want to add to your existing codebase (e.g. Add a wishlist feature with database persistence and user session check)..."
											: "Deskripsikan fitur yang ingin kamu tambahkan ke aplikasi (misal: Tambahkan fitur wishlist di halaman detail produk yang terhubung ke session user)..."
										: greenfieldPlaceholder
								}
								className="w-full resize-none border-none bg-transparent px-3 pb-2 pt-3 font-inter text-[15px] text-snow outline-none placeholder:text-slate"
								style={{ caretColor: "var(--text-primary)" }}
								rows={3}
							/>

							<ChatInputActions
								language={language}
								onLanguageChange={handleLanguageChange}
								message={message}
								isSending={isSending}
								onSend={handleSend}
							/>
						</div>

						{/* Prompt error message */}
						{promptError && (
							<div className="px-3 pb-2">
								<p className="animate-in fade-in slide-in-from-top-1 font-inter text-[12px] text-crimson duration-200">
									{promptError}
								</p>
							</div>
						)}
					</div>
				</div>
			</div>

			<CreditExhaustedModal
				isOpen={!!creditsExhaustedMsg}
				onClose={() => setCreditsExhaustedMsg(null)}
				errorMessage={creditsExhaustedMsg || ""}
				projectId=""
				stage="prd"
			/>
		</>
	);
}
