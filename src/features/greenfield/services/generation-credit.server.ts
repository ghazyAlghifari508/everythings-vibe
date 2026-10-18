// Shared credit + project-lock gate for the AC and Task generation endpoints.
//
// Both stages quote, reserve, and settle identically, and both use the same
// single-flight project lock (`acStatus` / `taskStatus`) so a second request
// can never generate against a reservation a concurrent stream owns. Keeping
// the reservation error mapping in one place makes the honest status mapping
// (403 exhaustion, 404 ownership, 409 race, 5xx unexpected) impossible to
// drift between stages.
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { creditOperations, projects } from "@/db/schema";
import type {
	EffectiveSubscription,
	SubscriptionRowLike,
} from "@/features/billing/services/billing";
import {
	type CreditComplexityMetrics,
	type CreditQuote,
	formatInsufficientCreditsError,
	formatSubscriptionPausedError,
} from "@/lib/adaptive-credit";
import { CLAIM_POLL_MS, CLAIM_RETRY_MS } from "@/lib/constants";
import {
	type CreditOperationResult,
	CreditSubscriptionOriginError,
	isReleasableReservation,
	releaseCreditOperation,
	reserveActiveCreditOperation,
} from "@/lib/services/credit-service";

/** Burnable credits right now (never negative). */
export function availableCredits(sub: SubscriptionRowLike | undefined): number {
	return Math.max(
		0,
		(sub?.credits ?? 0) - (sub?.creditsUsed ?? 0) - (sub?.creditsReserved ?? 0),
	);
}

export type ReservationResult =
	| { ok: true; reservation: CreditOperationResult }
	| { ok: false; response: Response };

export interface GenerationCreditInput {
	userId: string;
	projectId: string;
	stage: "ac" | "task";
	operation: "ac_generation" | "task_generation";
	metrics: CreditComplexityMetrics;
	quote: CreditQuote;
	availableCredits: number;
	effective: EffectiveSubscription;
	/** Human stage label used by the credit error payloads, e.g. "generate AC". */
	stageLabel: string;
	conflictMessage: string;
	setupFailedMessage: string;
	logLabel: string;
	callerIdempotencyKey?: string;
	callerAttempt?: number;
}

export async function reserveGenerationCredit(
	input: GenerationCreditInput,
): Promise<ReservationResult> {
	const {
		userId,
		projectId,
		stage,
		operation,
		metrics,
		quote,
		availableCredits: credits,
		stageLabel,
		conflictMessage,
		setupFailedMessage,
		logLabel,
	} = input;

	if (input.effective.state === "paused") {
		return {
			ok: false,
			response: Response.json(
				formatSubscriptionPausedError({
					quote,
					availableCredits: credits,
					stageLabel,
				}),
				{ status: 403 },
			),
		};
	}

	if (credits < quote.maximumCredits) {
		return {
			ok: false,
			response: Response.json(
				formatInsufficientCreditsError({
					quote,
					availableCredits: credits,
					stageLabel,
				}),
				{ status: 403 },
			),
		};
	}

	const idempotencyKey =
		input.callerIdempotencyKey ||
		`${projectId}:${stage}:${input.callerAttempt ?? 1}`;

	try {
		// A reused key whose operation already terminated cannot generate again:
		// mint a fresh attempt instead of regenerating for free (settled) or
		// against a dead reservation. Genuine in-flight retries keep joining.
		const reservation = await reserveActiveCreditOperation({
			userId,
			projectId,
			stage,
			operation,
			metrics,
			idempotencyKey,
			quote,
		});
		return { ok: true, reservation };
	} catch (err) {
		console.error(`${logLabel} reserveCreditOperation failed:`, err);
		// Map the failure honestly: only genuine credit exhaustion is a 403.
		// Ownership problems are 404, idempotency races are 409, and unexpected
		// failures (DB outage, quote errors) are 5xx so clients/operators can
		// retry and reconcile.
		const message = err instanceof Error ? err.message : "Reservation failed";
		if (
			err instanceof CreditSubscriptionOriginError ||
			message === "Insufficient available credit"
		) {
			return {
				ok: false,
				response: Response.json(
					formatInsufficientCreditsError({
						quote,
						availableCredits: credits,
						stageLabel,
					}),
					{ status: 403 },
				),
			};
		}
		if (message === "Credit operation ownership mismatch") {
			return {
				ok: false,
				response: Response.json(
					{ error: "Project not found" },
					{ status: 404 },
				),
			};
		}
		if (
			message === "Credit operation idempotency conflict" ||
			message === "Credit operation reservation transition conflict"
		) {
			return {
				ok: false,
				response: Response.json({ error: conflictMessage }, { status: 409 }),
			};
		}
		return {
			ok: false,
			response: Response.json({ error: setupFailedMessage }, { status: 500 }),
		};
	}
}

type GenerationLockField = "acStatus" | "taskStatus";

function generatingSet(field: GenerationLockField) {
	return field === "acStatus"
		? { acStatus: "generating" }
		: { taskStatus: "generating" };
}

function notGenerating(field: GenerationLockField) {
	return field === "acStatus"
		? ne(projects.acStatus, "generating")
		: ne(projects.taskStatus, "generating");
}

function pendingSet(field: GenerationLockField) {
	return field === "acStatus"
		? { acStatus: "pending" }
		: { taskStatus: "pending" };
}

function statusLogLabel(field: GenerationLockField): string {
	return field === "acStatus" ? "ac_status" : "task_status";
}

/**
 * Single-flight the project's generation lock. Returns null when the claim was
 * taken, or the 409 response to send (releasing our still-releasable
 * reservation first — never a running one, which the concurrent request owns).
 */
export async function claimGenerationLock(input: {
	field: GenerationLockField;
	userId: string;
	projectId: string;
	reservation: CreditOperationResult;
	conflictMessage: string;
}): Promise<Response | null> {
	const { field, userId, projectId, reservation, conflictMessage } = input;
	const releaseReason =
		field === "acStatus"
			? "AC generation conflict"
			: "Task generation conflict";

	const claim = () =>
		db
			.update(projects)
			.set(generatingSet(field))
			.where(and(eq(projects.id, projectId), notGenerating(field)))
			.returning({ id: projects.id });

	let claimed = await claim();
	if (!claimed.length) {
		for (let waited = 0; waited < CLAIM_RETRY_MS; waited += CLAIM_POLL_MS) {
			await new Promise((r) => setTimeout(r, CLAIM_POLL_MS));
			claimed = await claim();
			if (claimed.length) break;
		}
		if (!claimed.length) {
			if (isReleasableReservation(reservation.state)) {
				await releaseCreditOperation({
					userId,
					operationId: reservation.id,
					reason: releaseReason,
				}).catch(() => {});
			}
			return Response.json({ error: conflictMessage }, { status: 409 });
		}
	}
	return null;
}

/**
 * Lock reset for the error paths. A stale stream must never clear a newer
 * generation's lock: the reset runs only while no newer active credit
 * operation for this project+stage exists. Fails open (resets) when the check
 * itself errors, preserving liveness.
 */
export function createGenerationLockReset(input: {
	field: GenerationLockField;
	userId: string;
	projectId: string;
	stage: "ac" | "task";
	operationId: string;
}): () => Promise<void> {
	const { field, userId, projectId, stage, operationId } = input;

	return async () => {
		try {
			const [latest] = await db
				.select({ id: creditOperations.id })
				.from(creditOperations)
				.where(
					and(
						eq(creditOperations.userId, userId),
						eq(creditOperations.projectId, projectId),
						eq(creditOperations.stage, stage),
						inArray(creditOperations.state, [
							"quoted",
							"reserved",
							"running",
							"settling",
						]),
					),
				)
				.orderBy(desc(creditOperations.createdAt))
				.limit(1);
			if (latest && latest.id !== operationId) return;
		} catch {
			// Unavailable check: reset anyway rather than leaving the lock stuck.
		}
		try {
			await db
				.update(projects)
				.set(pendingSet(field))
				.where(eq(projects.id, projectId));
		} catch (e) {
			console.error(`${statusLogLabel(field)} reset failed:`, e);
		}
	};
}
