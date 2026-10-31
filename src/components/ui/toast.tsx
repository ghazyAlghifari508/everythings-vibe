"use client";

import {
	AlertCircleIcon,
	Cancel01Icon,
	InformationCircleIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";

export function Toast() {
	const { toastMessage, toastType, toastId, hideToast } = useUIStore();

	useEffect(() => {
		if (toastMessage && toastId !== undefined) {
			const timer = setTimeout(hideToast, 4000);
			return () => clearTimeout(timer);
		}
	}, [toastMessage, toastId, hideToast]);

	if (!toastMessage) return null;

	const isError = toastType === "error";
	const isSuccess = toastType === "success";

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
		<section
			aria-label="Notifikasi sistem"
			className="fixed z-[60] pointer-events-none left-4 right-4 sm:left-auto sm:right-6 max-w-[calc(100vw-2rem)] sm:max-w-md"
			style={{
				bottom:
					"calc(var(--toast-bottom-offset, 5.25rem) + env(safe-area-inset-bottom, 0px))",
			}}
		>
			<div
				role={isError ? "alert" : "status"}
				aria-live={isError ? "assertive" : "polite"}
				aria-atomic="true"
				className={cn(
					"pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm font-[510] shadow-[var(--shadow-overlay)]",
					"bg-obsidian border-graphite text-snow",
					"animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none",
				)}
			>
				<Icon
					icon={icon}
					size={16}
					className={cn("mt-0.5 shrink-0", iconColor)}
					aria-hidden
				/>
				<div className="flex-1 whitespace-pre-line leading-snug">
					{toastMessage}
				</div>
				<button
					type="button"
					onClick={hideToast}
					aria-label="Tutup notifikasi"
					className="shrink-0 rounded p-0.5 text-fog hover:text-snow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<Icon icon={Cancel01Icon} size={14} aria-hidden />
				</button>
			</div>
		</section>
	);
}
