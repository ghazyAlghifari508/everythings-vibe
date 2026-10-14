import type { ScrapeStatus } from "@/db/schema";
import {
	type DesignErrorCode,
	isRetryableScrapeErrorCode,
	ScrapeError,
} from "@/lib/design-errors";

export interface ScrapeRetryDecisionInput {
	status: ScrapeStatus | string;
	errorCode: string | null;
	retryAfterExpiresAt: string | null;
	activeJobs: number;
	maxActiveJobs: number;
	now?: number;
}

export type ScrapeRetryDecision =
	| { allowed: true }
	| {
			allowed: false;
			code: DesignErrorCode;
			message: string;
			retryAfterSeconds?: number;
	  };

function cooldownRemainingSeconds(
	expiresAt: string | null,
	now: number,
): number | null {
	if (!expiresAt) return null;
	const target = Date.parse(expiresAt);
	if (!Number.isFinite(target)) return null;
	const remaining = Math.ceil((target - now) / 1000);
	return remaining > 0 ? remaining : null;
}

// One shared decision for both the API retry action and the failure UI, so a
// retry is only ever offered when the backend would actually accept it. The
// order matters: a website-imposed cooldown is reported before queue capacity
// because waiting for the site is the action the user must take first.
export function resolveScrapeRetryDecision({
	status,
	errorCode,
	retryAfterExpiresAt,
	activeJobs,
	maxActiveJobs,
	now = Date.now(),
}: ScrapeRetryDecisionInput): ScrapeRetryDecision {
	if (status !== "failed") return { allowed: true };
	const remaining = cooldownRemainingSeconds(retryAfterExpiresAt, now);
	if (remaining !== null)
		return {
			allowed: false,
			code: "WEBSITE_RATE_LIMITED",
			message:
				"Website masih membatasi permintaan otomatis. Tunggu hingga waktu tunggu berakhir.",
			retryAfterSeconds: remaining,
		};
	if (!isRetryableScrapeErrorCode(errorCode))
		return {
			allowed: false,
			code:
				errorCode === "INVALID_URL" ||
				errorCode === "PRIVATE_URL_BLOCKED" ||
				errorCode === "WEBSITE_ACCESS_DENIED" ||
				errorCode === "WEBSITE_NOT_FOUND"
					? errorCode
					: "UNEXPECTED_ERROR",
			message: "Retry tidak tersedia untuk kegagalan ini. Gunakan URL lain.",
		};
	if (activeJobs >= maxActiveJobs)
		return {
			allowed: false,
			code: "QUEUE_CAPACITY",
			message: "Tunggu proses aktif selesai sebelum memulai ekstraksi baru.",
		};
	return { allowed: true };
}

export function assertScrapeRetryAllowed(decision: ScrapeRetryDecision): void {
	if (decision.allowed) return;
	throw new ScrapeError(decision.code, decision.message, {
		...(decision.retryAfterSeconds === undefined
			? {}
			: { retryAfterSeconds: decision.retryAfterSeconds }),
	});
}
