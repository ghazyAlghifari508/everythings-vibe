import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SettingsContentPanelProps {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
	headerClassName?: string;
	contentClassName?: string;
}

export function SettingsContentPanel({
	title,
	description,
	actions,
	children,
	className,
	headerClassName,
	contentClassName,
}: SettingsContentPanelProps) {
	return (
		<section
			data-testid="settings-content-panel"
			className={cn(
				"w-full rounded-xl border border-(--border-subtle) bg-(--bg-card) p-6",
				className,
			)}
		>
			<div
				className={cn(
					"flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-(--border-subtle) pb-6 mb-6",
					headerClassName,
				)}
			>
				<div>
					<h2 className="font-inter font-[510] text-xl font-bold text-snow">
						{title}
					</h2>
					{description && (
						<p className="mt-1 text-sm text-(--text-secondary)">
							{description}
						</p>
					)}
				</div>
				{actions && (
					<div className="flex shrink-0 items-center gap-2">{actions}</div>
				)}
			</div>
			<div className={contentClassName}>{children}</div>
		</section>
	);
}
