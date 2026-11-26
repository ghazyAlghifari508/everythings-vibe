import {
	ArrowLeft01Icon,
	ArrowRight01Icon,
	MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import * as React from "react";
import { type ButtonProps, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type PaginationPageItem = number | "ellipsis-start" | "ellipsis-end";

export function generatePaginationPages(
	currentPage: number,
	totalPages: number,
): PaginationPageItem[] {
	if (totalPages <= 7) {
		return Array.from({ length: totalPages }, (_, i) => i + 1);
	}

	if (currentPage <= 4) {
		return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
	}

	if (currentPage >= totalPages - 3) {
		return [
			1,
			"ellipsis-start",
			totalPages - 4,
			totalPages - 3,
			totalPages - 2,
			totalPages - 1,
			totalPages,
		];
	}

	return [
		1,
		"ellipsis-start",
		currentPage - 1,
		currentPage,
		currentPage + 1,
		"ellipsis-end",
		totalPages,
	];
}

const Pagination = ({ className, ...props }: React.ComponentProps<"nav">) => (
	<nav
		aria-label="pagination"
		className={cn("mx-auto flex w-full items-center justify-center", className)}
		{...props}
	/>
);
Pagination.displayName = "Pagination";

const PaginationContent = React.forwardRef<
	HTMLUListElement,
	React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
	<ul
		ref={ref}
		className={cn("flex flex-row items-center gap-1.5", className)}
		{...props}
	/>
));
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<
	HTMLLIElement,
	React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
	<li
		ref={ref}
		className={cn("inline-flex items-center", className)}
		{...props}
	/>
));
PaginationItem.displayName = "PaginationItem";

export type PaginationLinkProps = {
	isActive?: boolean;
} & Pick<ButtonProps, "size"> &
	React.ButtonHTMLAttributes<HTMLButtonElement>;

const PaginationLink = ({
	className,
	isActive,
	size = "icon",
	type = "button",
	...props
}: PaginationLinkProps) => (
	<button
		type={type}
		aria-current={isActive ? "page" : undefined}
		className={cn(
			buttonVariants({
				variant: isActive ? "outline" : "ghost",
				size,
			}),
			"min-h-9 min-w-9 rounded-lg font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:ring-indigo disabled:pointer-events-none disabled:opacity-30",
			isActive
				? "border-graphite bg-charcoal font-semibold text-snow shadow-xs hover:bg-charcoal hover:text-snow"
				: "border-transparent text-fog hover:border-graphite/40 hover:bg-charcoal/60 hover:text-snow",
			className,
		)}
		{...props}
	/>
);
PaginationLink.displayName = "PaginationLink";

const PaginationPrevious = ({
	className,
	label = "Sebelumnya",
	showLabel = false,
	...props
}: React.ComponentProps<typeof PaginationLink> & {
	label?: string;
	showLabel?: boolean;
}) => (
	<PaginationLink
		aria-label="Halaman sebelumnya"
		size={showLabel ? "default" : "icon"}
		className={cn(
			"gap-1.5 border border-graphite bg-onyx px-2.5 text-fog transition-colors hover:border-fog/40 hover:bg-charcoal hover:text-snow",
			className,
		)}
		{...props}
	>
		<Icon icon={ArrowLeft01Icon} size={15} aria-hidden />
		{showLabel && <span>{label}</span>}
	</PaginationLink>
);
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = ({
	className,
	label = "Berikutnya",
	showLabel = false,
	...props
}: React.ComponentProps<typeof PaginationLink> & {
	label?: string;
	showLabel?: boolean;
}) => (
	<PaginationLink
		aria-label="Halaman berikutnya"
		size={showLabel ? "default" : "icon"}
		className={cn(
			"gap-1.5 border border-graphite bg-onyx px-2.5 text-fog transition-colors hover:border-fog/40 hover:bg-charcoal hover:text-snow",
			className,
		)}
		{...props}
	>
		{showLabel && <span>{label}</span>}
		<Icon icon={ArrowRight01Icon} size={15} aria-hidden />
	</PaginationLink>
);
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({
	className,
	...props
}: React.ComponentProps<"span">) => (
	<span
		aria-hidden
		className={cn(
			"flex h-9 w-9 items-center justify-center text-fog/60",
			className,
		)}
		{...props}
	>
		<Icon icon={MoreHorizontalIcon} size={16} />
		<span className="sr-only">Halaman lainnya</span>
	</span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationLink,
	PaginationPrevious,
	PaginationNext,
	PaginationEllipsis,
};
