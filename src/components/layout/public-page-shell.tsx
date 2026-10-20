import type * as React from "react";
import { cn } from "@/lib/utils";

export interface PublicPageShellProps
	extends React.HTMLAttributes<HTMLElement> {
	children: React.ReactNode;
	className?: string;
}

export function PublicPageShell({
	children,
	className,
	...props
}: PublicPageShellProps) {
	return (
		<main
			className={cn(
				"mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14",
				className,
			)}
			{...props}
		>
			{children}
		</main>
	);
}

export interface PublicPageHeaderProps
	extends React.HTMLAttributes<HTMLElement> {
	title: string;
	description?: string;
	className?: string;
	children?: React.ReactNode;
}

export function PublicPageHeader({
	title,
	description,
	className,
	children,
	...props
}: PublicPageHeaderProps) {
	return (
		<header className={cn("space-y-3", className)} {...props}>
			<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
				{title}
			</h1>
			{description && (
				<p className="max-w-2xl text-sm leading-6 text-fog sm:text-base">
					{description}
				</p>
			)}
			{children}
		</header>
	);
}
