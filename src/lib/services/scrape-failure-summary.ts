import {
	type DesignErrorCode,
	designErrorCodeForHttpStatus,
} from "@/lib/design-errors";

// Structured evidence for one resource that failed during a worker-mode run.
// Messages are never matched: only a parsed HTTP status or a typed error code
// counts, so a failure reason is never inferred from copy.
export interface FailedResourceEvidence {
	code: string | null;
	httpStatus: number | null;
}

export interface ResourceFailureClassification {
	code: DesignErrorCode;
	httpStatus?: number;
	failedCount: number;
}

const CODE_PRIORITY: DesignErrorCode[] = [
	"JOB_TIMEOUT",
	"WORKER_INTERRUPTED",
	"STORAGE_FAILED",
	"FETCH_TIMEOUT",
	"WEBSITE_NAVIGATION_TIMEOUT",
	"ASSET_FETCH_FAILED",
	"CAPTURE_FAILED",
	"NO_ANALYZABLE_CONTENT",
	"WEBSITE_ACCESS_DENIED",
	"WEBSITE_RATE_LIMITED",
	"WEBSITE_NOT_FOUND",
	"WEBSITE_SERVER_ERROR",
	"WEBSITE_BLOCKED",
];

function dominantStatus(rows: FailedResourceEvidence[]): number | undefined {
	const counts = new Map<number, number>();
	for (const row of rows) {
		if (typeof row.httpStatus !== "number" || row.httpStatus < 400) continue;
		counts.set(row.httpStatus, (counts.get(row.httpStatus) ?? 0) + 1);
	}
	let winner: number | undefined;
	let best = 0;
	for (const [status, count] of counts) {
		if (
			count > best ||
			(count === best && winner !== undefined && status < winner)
		) {
			winner = status;
			best = count;
		}
	}
	return winner;
}

function dominantCode(
	rows: FailedResourceEvidence[],
): DesignErrorCode | undefined {
	const counts = new Map<DesignErrorCode, number>();
	for (const row of rows) {
		const code = CODE_PRIORITY.find((candidate) => candidate === row.code);
		if (!code) continue;
		counts.set(code, (counts.get(code) ?? 0) + 1);
	}
	let winner: DesignErrorCode | undefined;
	let best = 0;
	for (const code of CODE_PRIORITY) {
		const count = counts.get(code) ?? 0;
		if (count > best) {
			winner = code;
			best = count;
		}
	}
	return winner;
}

function allRowsShare(
	rows: FailedResourceEvidence[],
	predicate: (row: FailedResourceEvidence) => boolean,
): boolean {
	return rows.length > 0 && rows.every(predicate);
}

// Every failed resource must carry the same real cause before that cause is
// reported as the run's failure. A mixed bag is reported as an asset-level
// failure instead of blaming one website answer for everything.
export function classifyImageFailures(
	rows: FailedResourceEvidence[],
): ResourceFailureClassification {
	const failedCount = rows.length;
	if (failedCount === 0) return { code: "NO_ANALYZABLE_CONTENT", failedCount };
	const sharedCode = allRowsShare(rows, (row) => row.code === rows[0].code)
		? dominantCode(rows)
		: undefined;
	if (sharedCode) return { code: sharedCode, failedCount };
	const sharedStatus = allRowsShare(
		rows,
		(row) => row.httpStatus === rows[0].httpStatus,
	)
		? dominantStatus(rows)
		: undefined;
	if (sharedStatus !== undefined)
		return {
			code: designErrorCodeForHttpStatus(sharedStatus),
			httpStatus: sharedStatus,
			failedCount,
		};
	return { code: "ASSET_FETCH_FAILED", failedCount };
}

// Crawl pages mix status answers, transport faults and policy skips, so the
// most frequent real cause wins, and a status answer keeps its numeric evidence.
export function classifyCrawlFailures(
	rows: FailedResourceEvidence[],
): ResourceFailureClassification {
	const failedCount = rows.length;
	if (failedCount === 0) return { code: "NO_ANALYZABLE_CONTENT", failedCount };
	const status = dominantStatus(rows);
	if (status !== undefined)
		return {
			code: designErrorCodeForHttpStatus(status),
			httpStatus: status,
			failedCount,
		};
	const code = dominantCode(rows);
	if (code) return { code, failedCount };
	return { code: "NO_ANALYZABLE_CONTENT", failedCount };
}
