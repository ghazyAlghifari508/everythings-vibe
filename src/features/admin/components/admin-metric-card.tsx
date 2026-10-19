import type React from "react";
import { memo } from "react";
import { Icon, type IconProps } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useStreamerMode } from "./streamer-mode-context";

interface AdminMetricCardProps {
	label: string;
	value: string | number;
	subtext?: string;
	icon:
		| IconProps["icon"]
		| React.ComponentType<{ size?: number; className?: string }>;
	isCurrency?: boolean;
	className?: string;
}

export const AdminMetricCard = memo(function AdminMetricCard({
	label,
	value,
	subtext,
	icon,
	isCurrency = false,
	className,
}: AdminMetricCardProps) {
	const { isStreamerMode, maskCurrency } = useStreamerMode();

	let displayValue = value;
	if (isCurrency) {
		if (isStreamerMode) {
			displayValue = "••••••••";
		} else if (typeof value === "number") {
			displayValue = maskCurrency(value);
		}
	}

	const renderIcon = () => {
		if (
			typeof icon === "function" ||
			(typeof icon === "object" && icon !== null && "$$typeof" in icon)
		) {
			const ComponentIcon = icon as React.ComponentType<{
				size?: number;
				className?: string;
			}>;
			return <ComponentIcon size={16} className="text-fog" />;
		}
		return (
			<Icon icon={icon as IconProps["icon"]} size={16} className="text-fog" />
		);
	};

	return (
		<div
			className={cn(
				"rounded-xl border border-graphite bg-charcoal p-4 sm:p-5 shadow-[var(--shadow-inset)] flex flex-col justify-between transition-colors",
				className,
			)}
		>
			<div className="flex items-center justify-between text-fog">
				<span className="text-xs font-medium text-mist">{label}</span>
				{renderIcon()}
			</div>
			<div className="mt-3">
				<p className="text-2xl font-light tracking-tight text-snow">
					{displayValue}
				</p>
				{subtext && (
					<p className="mt-1 truncate text-[11px] text-fog">{subtext}</p>
				)}
			</div>
		</div>
	);
});
