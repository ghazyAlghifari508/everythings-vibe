"use client";

import {
	AlertCircleIcon,
	Cancel01Icon,
	InformationCircleIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { type HTMLAttributes, type ReactNode, useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";

type ToastNoticeProps = Pick<
	HTMLAttributes<HTMLDivElement>,
	"onBlur" | "onFocus" | "onPointerEnter" | "onPointerLeave"
> & {
	message: string | null;
	type?: "success" | "error" | "info" | null;
	compact?: boolean;
	action?: ReactNode;
	onDismiss?: () => void;
};

export function ToastNotice({
	message,
	type,
	compact,
	action,
	onDismiss,
	...interaction
}: ToastNoticeProps) {
	const isError = type === "error";
	const announcement = {
		role: isError ? "alert" : "status",
		"aria-live": isError ? "assertive" : "polite",
		"aria-atomic": true,
	} as const;
	const dismiss = onDismiss && (
		<button
			type="button"
			onClick={onDismiss}
			aria-label="Tutup notifikasi"
			className={cn(
				"shrink-0 rounded text-fog transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo motion-reduce:transition-none",
				compact ? "grid size-11 place-items-center" : "p-0.5",
			)}
		>
			<Icon icon={Cancel01Icon} size={14} aria-hidden />
		</button>
	);

	if (compact) {
		return (
			<div
				{...interaction}
				className={cn(
					"flex max-w-full min-w-0 items-center gap-1 text-xs sm:text-sm",
					message &&
						"rounded-lg border border-graphite bg-obsidian py-px pr-1 pl-3 text-snow motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150",
				)}
			>
				<span
					{...announcement}
					className={cn(
						!message && "sr-only",
						isError
							? "py-2 wrap-anywhere text-crimson"
							: "truncate py-2 leading-snug",
					)}
					title={message ?? undefined}
				>
					{message}
				</span>
				{action}
				{dismiss}
			</div>
		);
	}

	if (!message) return null;
	const isSuccess = type === "success";
	const icon = isSuccess
		? Tick01Icon
		: isError
			? AlertCircleIcon
			: InformationCircleIcon;
	const iconColor = isSuccess
		? "text-emerald-500 dark:text-emerald-400"
		: isError
			? "text-crimson"
			: "text-fog";

	return (
		<div
			{...announcement}
			{...interaction}
			className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-graphite bg-obsidian px-3.5 py-2.5 text-sm font-[510] text-snow shadow-[var(--shadow-overlay)] animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
		>
			<Icon
				icon={icon}
				size={16}
				className={cn("mt-0.5 shrink-0", iconColor)}
				aria-hidden
			/>
			<div className="flex-1 whitespace-pre-line leading-snug">{message}</div>
			{action}
			{dismiss}
		</div>
	);
}

export function Toast() {
	const { toastMessage, toastType, toastId, hideToast } = useUIStore();

	useEffect(() => {
		if (toastMessage && toastId !== undefined) {
			const timer = setTimeout(hideToast, 4000);
			return () => clearTimeout(timer);
		}
	}, [toastMessage, toastId, hideToast]);

	if (!toastMessage) return null;

	return (
		<section
			aria-label="Notifikasi sistem"
			className="fixed z-[60] pointer-events-none left-4 right-4 sm:left-auto sm:right-6 max-w-[calc(100vw-2rem)] sm:max-w-md"
			style={{
				bottom:
					"calc(var(--toast-bottom-offset, 5.25rem) + env(safe-area-inset-bottom, 0px))",
			}}
		>
			<ToastNotice
				message={toastMessage}
				type={toastType}
				onDismiss={hideToast}
			/>
		</section>
	);
}
