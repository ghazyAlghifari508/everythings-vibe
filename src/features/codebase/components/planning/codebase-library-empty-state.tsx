"use client";

import {
	ArrowRight01Icon,
	DatabaseIcon,
	FileCodeIcon,
	FolderGitIcon,
	TerminalIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/ui/icon";
import { NEW_REPOSITORY_HREF } from "@/features/codebase/services/library";

/**
 * Empty state rendered when the user has zero connected repositories.
 */
export function CodebaseLibraryEmptyState() {
	return (
		<section
			aria-labelledby="empty-codebase-heading"
			className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center py-6 text-center"
		>
			<div
				className="flex h-12 w-12 items-center justify-center rounded-xl border border-graphite bg-charcoal/60 text-snow"
				aria-hidden
			>
				<Icon icon={FolderGitIcon} size={24} className="text-fog" />
			</div>
			<h2
				id="empty-codebase-heading"
				className="mt-5 text-xl font-semibold tracking-tight text-snow sm:text-2xl"
			>
				Belum ada repository terhubung
			</h2>
			<p className="mt-2.5 text-sm leading-6 text-fog">
				Hubungkan repository lokal untuk membaca struktur codebase dan
				menyiapkan workspace perencanaan yang bisa kamu lanjutkan kapan saja.
			</p>
			<Link
				to={NEW_REPOSITORY_HREF}
				className="btn-primary mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
			>
				Hubungkan repository
				<Icon icon={ArrowRight01Icon} size={16} aria-hidden />
			</Link>
			<div className="mt-10 flex w-full flex-col items-center justify-center gap-4 border-t border-graphite/40 pt-8 sm:mt-12 sm:flex-row sm:gap-8">
				<div className="flex items-center gap-2 text-xs text-fog">
					<Icon
						icon={FileCodeIcon}
						size={16}
						className="text-slate"
						aria-hidden
					/>
					<span>Codebase terbaca</span>
				</div>
				<div className="flex items-center gap-2 text-xs text-fog">
					<Icon
						icon={DatabaseIcon}
						size={16}
						className="text-slate"
						aria-hidden
					/>
					<span>Konteks tersimpan</span>
				</div>
				<div className="flex items-center gap-2 text-xs text-fog">
					<Icon
						icon={TerminalIcon}
						size={16}
						className="text-slate"
						aria-hidden
					/>
					<span>Workspace siap</span>
				</div>
			</div>
		</section>
	);
}
