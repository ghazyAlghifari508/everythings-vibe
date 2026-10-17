"use client";

interface ScreenIncompleteSyncProps {
	projectName: string;
	isStarting?: boolean;
	onStartSync: () => void;
}

export function ScreenIncompleteSync({
	projectName,
	isStarting = false,
	onStartSync,
}: ScreenIncompleteSyncProps) {
	return (
		<div
			data-testid="codebase-incomplete-sync"
			className="mx-auto w-full max-w-2xl rounded-xl border border-graphite bg-charcoal p-8 text-center sm:p-10"
		>
			<p className="font-mono text-xs uppercase tracking-widest text-fog">
				{projectName}
			</p>
			<h2 className="mt-3 text-xl font-semibold text-snow">
				Repository belum selesai disinkronkan
			</h2>
			<p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-fog">
				Setup repository ini belum selesai. Mulai ulang sync untuk melanjutkan.
			</p>
			<button
				type="button"
				onClick={onStartSync}
				disabled={isStarting}
				className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-snow px-6 text-sm font-semibold text-onyx transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
			>
				{isStarting ? "Menyiapkan..." : "Mulai ulang sync"}
			</button>
		</div>
	);
}
