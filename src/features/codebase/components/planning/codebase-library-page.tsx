import { CodebaseLibraryView } from "@/features/codebase/components/planning/codebase-library-view";
import type { CodebaseLibraryItem } from "@/features/codebase/services/library";

/**
 * The saved-repository library page shell for `/codebases`.
 *
 * The loader owns the query; this module owns the three states that page can
 * be in — loading, failed, and loaded — so the route file stays a declaration.
 */

export function CodebaseLibraryPage({
	items,
}: {
	items: CodebaseLibraryItem[];
}) {
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<CodebaseLibraryView items={items} />
		</main>
	);
}

export function CodebaseLibraryPending() {
	return (
		<main
			className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14"
			aria-busy="true"
		>
			<header className="flex flex-col gap-4 border-b border-graphite pb-6 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<div className="h-3 w-36 animate-pulse rounded bg-graphite" />
					<div className="mt-3 h-10 w-64 animate-pulse rounded bg-graphite" />
					<div className="mt-3 h-4 max-w-xl animate-pulse rounded bg-graphite" />
				</div>
				<div className="h-11 w-44 animate-pulse rounded-md bg-graphite/40" />
			</header>
			<div className="flex flex-col gap-3">
				{["one", "two", "three"].map((row) => (
					<div
						key={row}
						className="h-32 animate-pulse rounded-xl border border-graphite bg-charcoal/60"
					/>
				))}
			</div>
			<p className="text-sm text-fog">Memuat project tersimpan...</p>
		</main>
	);
}

export function CodebaseLibraryError({ onRetry }: { onRetry: () => void }) {
	return (
		<main className="mx-auto flex max-w-5xl flex-1 flex-col gap-4 px-4 py-12 sm:px-6">
			<div
				role="alert"
				className="rounded-xl border border-crimson/40 bg-crimson/10 p-5 text-crimson"
			>
				<h1 className="text-lg font-semibold">
					Project tersimpan gagal dimuat
				</h1>
				<p className="mt-1 text-sm">
					Periksa koneksi lalu coba muat ulang daftar project tersimpan.
				</p>
				<button
					type="button"
					onClick={onRetry}
					className="mt-4 min-h-11 rounded-md border border-crimson/50 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Coba lagi
				</button>
			</div>
		</main>
	);
}
