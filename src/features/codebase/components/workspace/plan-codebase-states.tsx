/**
 * The two centered cards the onboarding page shows before the workspace opens:
 * a terminal create-failure alert and the neutral "still starting" spinner.
 *
 * They live apart from the page shell so the shell stays readable and so the
 * copy that describes a failed or in-flight create has one home.
 */

import { Spinner } from "@/components/ui/spinner";

/** Terminal create-failure heading; the body carries the safe server message. */
const CODEBASE_ONBOARDING_ERROR_TITLE = "Gagal menyiapkan repository";

/**
 * Shared body copy for both loading cards: the page is connecting a repository
 * and initialising the CLI instructions either way, only the heading differs.
 */
const CODEBASE_ONBOARDING_LOADING_DETAIL =
	"Menghubungkan repository dan menginisialisasi instruksi CLI";

export function CodebaseOnboardingErrorCard({
	error,
	onRetry,
}: {
	error: string;
	onRetry: () => void;
}) {
	return (
		<div className="flex min-h-[50vh] flex-1 items-center justify-center py-12">
			<div
				role="alert"
				className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-crimson/40 bg-crimson/10 p-8 text-center sm:p-10"
			>
				<div className="space-y-1">
					<p className="text-sm font-medium text-snow">
						{CODEBASE_ONBOARDING_ERROR_TITLE}
					</p>
					<p className="text-xs text-fog">{error}</p>
				</div>
				<button
					type="button"
					onClick={onRetry}
					className="inline-flex min-h-10 items-center justify-center rounded-md bg-snow px-5 text-xs font-semibold text-onyx transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Coba lagi
				</button>
			</div>
		</div>
	);
}

export function CodebaseOnboardingLoadingCard({
	title,
	detail = CODEBASE_ONBOARDING_LOADING_DETAIL,
}: {
	title: string;
	detail?: string;
}) {
	return (
		<div className="flex min-h-[50vh] flex-1 items-center justify-center py-12">
			<output className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-graphite bg-charcoal p-8 text-center sm:p-10">
				<Spinner size={36} className="text-indigo" />
				<div className="space-y-1">
					<p className="text-sm font-medium text-snow">{title}</p>
					<p className="text-xs text-fog">{detail}</p>
				</div>
			</output>
		</div>
	);
}
