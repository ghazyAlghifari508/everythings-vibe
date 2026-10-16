import { ScreenConnect } from "@/components/codebase/screen-connect";
import { ScreenIncompleteSync } from "@/components/codebase/screen-incomplete-sync";
import type { useCodebaseSync } from "../hooks/use-codebase-sync";

type ConnectionState = Pick<
	ReturnType<typeof useCodebaseSync>,
	| "error"
	| "status"
	| "payload"
	| "isStarting"
	| "triggerAnalysis"
	| "startSession"
	| "readStatus"
>;

export function WorkspaceConnectionScreen({
	name,
	error,
	status,
	payload,
	isStarting,
	triggerAnalysis,
	startSession,
	readStatus,
}: ConnectionState & { name: string }) {
	return (
		<main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
			<header className="border-b border-graphite pb-6">
				<p className="font-mono text-xs uppercase tracking-widest text-fog">
					Codebase / {name}
				</p>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight text-snow">
					Konteks repository
				</h1>
				<p className="mt-2 max-w-2xl text-sm leading-6 text-fog">
					Hubungkan repository, tunggu snapshot terverifikasi, lalu rencanakan
					fitur baru dengan konteks yang nyata.
				</p>
			</header>
			{error && (
				<div
					role="alert"
					className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-crimson/40 bg-crimson/10 p-4 text-sm text-crimson"
				>
					<span>{error}</span>
					<button
						type="button"
						onClick={() => {
							if (status?.analysisStatus === "failed" && status.snapshotId)
								void triggerAnalysis(status.snapshotId);
							else if (
								status?.status === "failed" ||
								status?.status === "expired"
							)
								void startSession("retry");
							else if (status) void readStatus();
							else void startSession("initial");
						}}
						className="min-h-11 rounded-md border border-crimson/50 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Coba lagi
					</button>
				</div>
			)}
			{payload !== null || isStarting ? (
				<ScreenConnect
					projectName={name}
					payload={payload}
					isStarting={isStarting}
					status={status}
					onRequestNewToken={() => void startSession("retry")}
					onRetrySync={() => void startSession("retry")}
				/>
			) : (
				<ScreenIncompleteSync
					projectName={name}
					isStarting={isStarting}
					onStartSync={() => void startSession("retry")}
				/>
			)}
		</main>
	);
}
