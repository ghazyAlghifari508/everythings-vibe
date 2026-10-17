export function CodebaseWorkspaceSkeleton() {
	return (
		<main
			data-testid="codebase-workspace-skeleton"
			aria-busy="true"
			aria-label="Memuat workspace codebase"
			className="flex h-dvh flex-col overflow-hidden bg-onyx text-snow"
		>
			<span className="sr-only">Memuat workspace codebase...</span>

			{/* Top workspace header placeholder */}
			<header
				data-testid="codebase-workspace-skeleton-header"
				className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-graphite bg-charcoal px-4"
			>
				<div className="flex min-w-0 items-center gap-2">
					<div className="flex items-center gap-2">
						<div className="h-5 w-5 animate-pulse rounded bg-graphite" />
						<div className="h-3.5 w-24 animate-pulse rounded bg-graphite/70" />
					</div>
					<span className="shrink-0 text-slate">/</span>
					<div className="h-6 w-32 animate-pulse rounded-md border border-graphite bg-obsidian" />
				</div>
				<div className="h-6 w-28 animate-pulse rounded-md border border-graphite bg-obsidian" />
			</header>

			{/* Workspace 2-pane body */}
			<div className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-onyx">
				{/* Left explorer pane skeleton */}
				<aside
					data-testid="codebase-explorer-skeleton"
					aria-hidden="true"
					className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col overflow-hidden border-r border-graphite bg-charcoal lg:flex"
				>
					{/* Repository summary card & search placeholder */}
					<div
						data-testid="codebase-explorer-skeleton-card"
						className="shrink-0 border-b border-graphite p-3"
					>
						<div className="rounded-lg border border-graphite bg-obsidian p-3">
							<div className="flex items-center justify-between gap-2">
								<div className="h-4 w-32 animate-pulse rounded bg-graphite" />
								<div className="h-3.5 w-12 animate-pulse rounded border border-graphite bg-graphite/40" />
							</div>
							<div className="mt-2 h-3 w-40 animate-pulse rounded bg-graphite/60" />
						</div>
						<div
							data-testid="codebase-explorer-skeleton-search"
							className="mt-2 h-8 w-full animate-pulse rounded-lg border border-graphite bg-obsidian"
						/>
					</div>

					{/* File tree placeholder */}
					<div
						data-testid="codebase-explorer-skeleton-tree"
						className="min-h-0 flex-1 overflow-y-auto p-2"
					>
						<div className="px-2 pb-1 pt-1">
							<div className="h-2.5 w-36 animate-pulse rounded bg-graphite/60" />
						</div>
						<div className="mt-1 flex flex-col gap-0.5">
							{/* Realistic nested directory & file rows matching ~36px row height */}
							<div className="flex h-9 items-center gap-2 rounded-md px-2">
								<div className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-slate/40" />
								<div className="h-3 w-20 animate-pulse rounded bg-graphite" />
							</div>
							<div className="flex h-9 items-center gap-2 rounded-md px-2 pl-5">
								<div className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-slate/40" />
								<div className="h-3 w-16 animate-pulse rounded bg-graphite" />
							</div>
							<div className="flex h-9 items-center gap-2 rounded-md px-2 pl-8">
								<div className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-slate/30" />
								<div className="h-3 w-24 animate-pulse rounded bg-graphite/80" />
							</div>
							<div className="flex h-9 items-center gap-2 rounded-md px-2 pl-8">
								<div className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-slate/30" />
								<div className="h-3 w-28 animate-pulse rounded bg-graphite/80" />
							</div>
							<div className="flex h-9 items-center gap-2 rounded-md px-2 pl-5">
								<div className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-slate/30" />
								<div className="h-3 w-20 animate-pulse rounded bg-graphite/80" />
							</div>
							<div className="flex h-9 items-center gap-2 rounded-md px-2">
								<div className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-slate/40" />
								<div className="h-3 w-14 animate-pulse rounded bg-graphite" />
							</div>
							<div className="flex h-9 items-center gap-2 rounded-md px-2 pl-5">
								<div className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-slate/30" />
								<div className="h-3 w-32 animate-pulse rounded bg-graphite/80" />
							</div>
							<div className="flex h-9 items-center gap-2 rounded-md px-2">
								<div className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-slate/30" />
								<div className="h-3 w-24 animate-pulse rounded bg-graphite/80" />
							</div>
						</div>
					</div>

					{/* Bottom stack section placeholder */}
					<div
						data-testid="codebase-explorer-skeleton-stack"
						className="shrink-0 border-t border-graphite p-3"
					>
						<div className="h-2.5 w-32 animate-pulse rounded bg-graphite/60" />
						<div className="mt-2 flex flex-wrap gap-1.5">
							<div className="h-5 w-16 animate-pulse rounded border border-graphite bg-obsidian" />
							<div className="h-5 w-20 animate-pulse rounded border border-graphite bg-obsidian" />
							<div className="h-5 w-14 animate-pulse rounded border border-graphite bg-obsidian" />
						</div>
					</div>
				</aside>

				{/* Main workspace / chat pane skeleton */}
				<section
					data-testid="codebase-chat-skeleton"
					aria-hidden="true"
					className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-onyx"
				>
					{/* Workspace header placeholder */}
					<div
						data-testid="codebase-chat-skeleton-header"
						className="shrink-0 border-b border-graphite bg-charcoal px-4 py-3"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="flex flex-col gap-1.5">
								<div className="h-4 w-48 animate-pulse rounded bg-graphite" />
								<div className="h-3 w-28 animate-pulse rounded bg-graphite/60" />
							</div>
						</div>
					</div>

					{/* Pristine state center block */}
					<div className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto px-4 pt-10 pb-8 sm:pt-14 md:pt-16 lg:pt-20">
						<div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
							{/* Heading & description */}
							<div className="flex flex-col items-center gap-2.5">
								<div className="h-8 w-64 animate-pulse rounded-lg bg-graphite sm:w-80 lg:w-96" />
								<div className="h-4 w-full max-w-xl animate-pulse rounded bg-graphite/70" />
								<div className="h-4 w-3/4 max-w-md animate-pulse rounded bg-graphite/50" />
							</div>

							{/* PromptBar placeholder */}
							<div
								data-testid="codebase-prompt-skeleton"
								className="flex min-h-[114px] w-full flex-col justify-between rounded-xl border border-graphite bg-charcoal/80 p-3.5 sm:p-4"
							>
								<div className="h-10 w-3/4 animate-pulse rounded bg-graphite/40" />
								<div className="mt-3 flex items-center justify-between pt-1">
									<div className="h-3 w-24 animate-pulse rounded bg-graphite/30" />
									<div className="h-8 w-8 animate-pulse rounded-lg bg-graphite/70" />
								</div>
							</div>

							{/* Starter actions grid */}
							<div
								data-testid="codebase-starters-skeleton"
								className="flex w-full flex-col gap-2.5 pt-1 text-left"
							>
								<div className="h-3 w-20 animate-pulse rounded bg-graphite/60" />
								<div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
									<div className="flex h-[62px] flex-col justify-center rounded-lg border border-graphite bg-charcoal/40 p-3">
										<div className="h-3.5 w-32 animate-pulse rounded bg-graphite" />
										<div className="mt-1.5 h-3 w-48 animate-pulse rounded bg-graphite/60" />
									</div>
									<div className="flex h-[62px] flex-col justify-center rounded-lg border border-graphite bg-charcoal/40 p-3">
										<div className="h-3.5 w-36 animate-pulse rounded bg-graphite" />
										<div className="mt-1.5 h-3 w-52 animate-pulse rounded bg-graphite/60" />
									</div>
									<div className="flex h-[62px] flex-col justify-center rounded-lg border border-graphite bg-charcoal/40 p-3">
										<div className="h-3.5 w-28 animate-pulse rounded bg-graphite" />
										<div className="mt-1.5 h-3 w-44 animate-pulse rounded bg-graphite/60" />
									</div>
									<div className="flex h-[62px] flex-col justify-center rounded-lg border border-graphite bg-charcoal/40 p-3">
										<div className="h-3.5 w-30 animate-pulse rounded bg-graphite" />
										<div className="mt-1.5 h-3 w-40 animate-pulse rounded bg-graphite/60" />
									</div>
								</div>
							</div>
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}
