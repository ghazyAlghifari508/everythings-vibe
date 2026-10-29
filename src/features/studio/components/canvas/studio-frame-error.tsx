import {
	AlertCircleIcon,
	Loading03Icon,
	Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export interface StudioFrameRetryButtonProps {
	label: string;
	pending?: boolean;
	onRetry: () => void;
}

/**
 * The one retry affordance for a frame. It shares the design system Button, is
 * disabled while a request is in flight so repeated clicks cannot enqueue a
 * second retry, and always shows the circular refresh arrow instead of an undo
 * arrow because nothing is being undone.
 */
export function StudioFrameRetryButton({
	label,
	pending = false,
	onRetry,
}: StudioFrameRetryButtonProps) {
	return (
		<Button
			type="button"
			size="sm"
			variant="secondary"
			disabled={pending}
			aria-busy={pending}
			onClick={(event) => {
				event.stopPropagation();
				onRetry();
			}}
			className="shrink-0 gap-1.5 border border-graphite bg-charcoal px-2.5 text-snow hover:bg-steel"
		>
			<Icon
				icon={pending ? Loading03Icon : Refresh01Icon}
				size={13}
				className={pending ? "motion-safe:animate-spin" : undefined}
			/>
			<span>{pending ? "Memproses" : label}</span>
		</Button>
	);
}

export interface StudioFrameErrorPanelProps {
	title: string;
	description: string;
	actionLabel: string;
	onAction?: () => void;
	actionPending?: boolean;
}

/**
 * A frame-local failure surface. It stays inside the failed artboard so a single
 * screen failing never escalates into a project-wide banner, and it offers
 * exactly one recovery action.
 */
export function StudioFrameErrorPanel({
	title,
	description,
	actionLabel,
	onAction,
	actionPending,
}: StudioFrameErrorPanelProps) {
	return (
		<div
			role="alert"
			className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center"
		>
			<Icon icon={AlertCircleIcon} size={20} className="text-crimson" />
			<div className="space-y-1">
				<p className="text-sm font-semibold text-snow">{title}</p>
				<p className="mx-auto max-w-[18rem] text-xs leading-5 text-fog">
					{description}
				</p>
			</div>
			{onAction ? (
				<StudioFrameRetryButton
					label={actionLabel}
					pending={actionPending}
					onRetry={onAction}
				/>
			) : null}
		</div>
	);
}

export interface StudioFrameStatusStripProps {
	message: string;
	tone?: "progress" | "danger";
	actionLabel?: string;
	onAction?: () => void;
	actionPending?: boolean;
}

/**
 * The small status band drawn over a preserved preview. Progress is polite,
 * failure is alerted, and both keep the last good artboard visible underneath:
 * queued, generating, failed and ready are never indistinguishable again.
 */
export function StudioFrameStatusStrip({
	message,
	tone = "progress",
	actionLabel,
	onAction,
	actionPending,
}: StudioFrameStatusStripProps) {
	return (
		<div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 border-t border-graphite bg-obsidian/95 px-2.5 py-1.5">
			<p
				role={tone === "danger" ? "alert" : "status"}
				className={`min-w-0 text-xs leading-4 ${
					tone === "danger" ? "text-snow" : "text-fog"
				}`}
			>
				{message}
			</p>
			{onAction && actionLabel ? (
				<StudioFrameRetryButton
					label={actionLabel}
					pending={actionPending}
					onRetry={onAction}
				/>
			) : null}
		</div>
	);
}
