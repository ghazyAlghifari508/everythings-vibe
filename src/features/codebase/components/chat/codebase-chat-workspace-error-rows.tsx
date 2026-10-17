"use client";

interface CodebaseChatWorkspaceErrorRowProps {
	message: string | null;
	onRetry?: () => void;
}

export function CodebaseChatWorkspaceSpecError({
	message,
	onRetry,
}: CodebaseChatWorkspaceErrorRowProps) {
	return (
		<div
			role="alert"
			data-testid="codebase-spec-error"
			className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-crimson/30 bg-crimson/10 p-2.5 text-xs text-crimson"
		>
			<span>{message}</span>
			{onRetry ? (
				<button
					type="button"
					onClick={onRetry}
					className="inline-flex min-h-7 items-center rounded border border-crimson/40 px-2 text-[11px] font-medium text-crimson hover:bg-crimson/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo"
				>
					Coba lagi
				</button>
			) : null}
		</div>
	);
}

export function CodebaseChatWorkspaceStageError({
	message,
	onRetry,
}: CodebaseChatWorkspaceErrorRowProps) {
	return (
		<div
			role="alert"
			data-testid="codebase-stage-error"
			className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-crimson/30 bg-crimson/10 p-2.5 text-xs text-crimson"
		>
			<span>{message}</span>
			{onRetry ? (
				<button
					type="button"
					onClick={onRetry}
					className="inline-flex min-h-9 items-center rounded-md border border-crimson/50 px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Coba lagi
				</button>
			) : null}
		</div>
	);
}
