import type * as React from "react";
import { cn } from "@/lib/utils";

export interface ScreenConnectStepItemProps {
	stepNumber: number;
	hasConnector?: boolean;
	connectorTestId?: string;
	children: React.ReactNode;
	className?: string;
	contentClassName?: string;
}

/**
 * Shared step layout primitive for ScreenConnect onboarding and re-sync modal.
 *
 * Enforces one clear owner for:
 * 1. Step number rail (`w-6 shrink-0 items-center`)
 * 2. Rail circle (`h-6 w-6 rounded-full border border-iron font-mono text-xs text-mist`)
 * 3. Step connector line (`mt-2 w-px flex-1 bg-graphite/40`)
 * 4. Step content indentation (`min-w-0 flex-1 flex-col gap-2`)
 * 5. Vertical step spacing rhythm (`hasConnector && "pb-6"`)
 */
export function ScreenConnectStepItem({
	stepNumber,
	hasConnector = false,
	connectorTestId,
	children,
	className,
	contentClassName,
}: ScreenConnectStepItemProps) {
	return (
		<div className={cn("flex items-stretch gap-3.5", className)}>
			<div className="flex w-6 shrink-0 flex-col items-center">
				<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist select-none">
					{stepNumber}
				</span>
				{hasConnector && (
					<div
						data-testid={connectorTestId ?? `step-connector-${stepNumber}`}
						className="mt-2 w-px flex-1 bg-graphite/40"
						aria-hidden="true"
					/>
				)}
			</div>
			<div
				className={cn(
					"flex min-w-0 flex-1 flex-col gap-2",
					hasConnector && "pb-6",
					contentClassName,
				)}
			>
				{children}
			</div>
		</div>
	);
}
