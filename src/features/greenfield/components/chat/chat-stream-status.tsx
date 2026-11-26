import { cn } from "@/lib/utils";
import { ALL_PRD_SECTIONS } from "./chat-revision";

export interface ChatStreamStatusProps {
	currentSection: string | null;
	completedSections: string[];
	isGeneratingPRD: boolean;
	isRevising: boolean;
}

export function ChatStreamStatus({
	currentSection,
	completedSections,
	isGeneratingPRD,
	isRevising,
}: ChatStreamStatusProps) {
	if (
		isRevising ||
		(!currentSection && completedSections.length === 0 && !isGeneratingPRD)
	) {
		return null;
	}

	return (
		<div>
			<div className="mb-1.5 text-xs font-[510] uppercase tracking-wide text-mist">
				{isGeneratingPRD
					? "Menyusun PRD"
					: completedSections.length >= ALL_PRD_SECTIONS.length
						? "PRD selesai"
						: "Proses generate PRD"}
			</div>
			<div className="rounded-lg border border-graphite bg-charcoal/40 px-4 py-3">
				<ul className="space-y-2">
					{ALL_PRD_SECTIONS.map((section) => {
						const isCompleted = completedSections.includes(section);
						const isCurrent = section === currentSection;

						return (
							<li
								key={section}
								className="flex items-center gap-2.5"
								aria-current={isCurrent ? "step" : undefined}
							>
								{isCompleted ? (
									<svg
										aria-hidden="true"
										width="10"
										height="10"
										viewBox="0 0 16 16"
										fill="currentColor"
										className="shrink-0 text-mist"
									>
										<path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
									</svg>
								) : isCurrent ? (
									<svg
										aria-hidden="true"
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										className="shrink-0 animate-spin text-snow"
									>
										<circle
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											strokeWidth="3"
											opacity="0.25"
										/>
										<path
											d="M12 2a10 10 0 019.95 9"
											stroke="currentColor"
											strokeWidth="3"
											strokeLinecap="round"
										/>
									</svg>
								) : (
									<svg
										aria-hidden="true"
										width="10"
										height="10"
										viewBox="0 0 16 16"
										fill="none"
										className="shrink-0 text-slate/40"
									>
										<circle
											cx="4"
											cy="8"
											r="4"
											stroke="currentColor"
											strokeWidth="1.5"
										/>
									</svg>
								)}
								<span
									className={cn(
										"truncate text-sm",
										isCompleted
											? "text-mist"
											: isCurrent
												? "font-[510] text-snow"
												: "text-slate",
									)}
								>
									{section}
									<span className="sr-only">
										{isCompleted
											? " (selesai)"
											: isCurrent
												? " (sedang diproses)"
												: " (menunggu)"}
									</span>
								</span>
							</li>
						);
					})}
				</ul>
			</div>
		</div>
	);
}
