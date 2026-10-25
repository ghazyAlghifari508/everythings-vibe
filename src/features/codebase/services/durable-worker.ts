import { config } from "dotenv";
import type {
	DurableGenerationClaim,
	WorkspaceGenerationExecutionResult,
	WorkspaceGenerationExecutor,
} from "../types/durable-generation";
import {
	claimNextGenerationOperation,
	executeGenerationOperationBounded,
	recoverStaleGenerationOperations,
} from "./durable-generation.server";

config({ path: [".env.local", ".env"] });

export const WORKER_POLL_INTERVAL_MS = 2_000;
export const STALE_RECOVERY_INTERVAL_MS = 30_000;

export interface DurableWorkerConfig {
	workerId?: string;
	pollIntervalMs?: number;
	executor?: WorkspaceGenerationExecutor;
}

let activeExecutor: WorkspaceGenerationExecutor = async (
	claim: DurableGenerationClaim,
): Promise<WorkspaceGenerationExecutionResult> => {
	console.warn(
		`[DurableWorker] No custom executor registered for stage ${claim.stage}. Simulating or waiting for stage handler.`,
	);
	return { artifactId: null, result: null };
};

export function registerWorkspaceGenerationExecutor(
	executor: WorkspaceGenerationExecutor,
): void {
	activeExecutor = executor;
}

export function getActiveWorkspaceGenerationExecutor(): WorkspaceGenerationExecutor {
	return activeExecutor;
}

export async function runDurableWorkerLoop(
	config: DurableWorkerConfig = {},
	stopSignal?: AbortSignal,
): Promise<void> {
	const workerId = config.workerId ?? `worker-${process.pid}`;
	const pollMs = config.pollIntervalMs ?? WORKER_POLL_INTERVAL_MS;
	const executor = config.executor ?? activeExecutor;

	let lastRecovery = 0;

	while (!stopSignal?.aborted) {
		const now = Date.now();
		if (now - lastRecovery > STALE_RECOVERY_INTERVAL_MS) {
			lastRecovery = now;
			try {
				await recoverStaleGenerationOperations();
			} catch (err) {
				console.error("[DurableWorker] Stale recovery check failed:", err);
			}
		}

		let claim: DurableGenerationClaim | null = null;
		try {
			claim = await claimNextGenerationOperation(workerId);
		} catch (claimError) {
			console.error(
				"[DurableWorker] Error claiming next operation:",
				claimError,
			);
		}

		if (!claim) {
			await new Promise((resolve) => setTimeout(resolve, pollMs));
			continue;
		}

		try {
			console.info(
				`[DurableWorker ${workerId}] Processing operation ${claim.operationId} (stage: ${claim.stage}, attempt: ${claim.attempt})`,
			);
			await executeGenerationOperationBounded(claim, executor);
		} catch (execError) {
			console.error(
				`[DurableWorker ${workerId}] Failed processing operation ${claim.operationId}:`,
				execError,
			);
		}
	}
}

// Standalone execution entrypoint
if (
	typeof process !== "undefined" &&
	process.argv[1] &&
	process.argv[1].endsWith("durable-worker.ts")
) {
	const controller = new AbortController();
	process.on("SIGINT", () => controller.abort());
	process.on("SIGTERM", () => controller.abort());

	console.info("Durable Codebase Generation Worker started...");
	runDurableWorkerLoop({}, controller.signal)
		.then(() =>
			console.info("Durable Codebase Generation Worker stopped cleanly."),
		)
		.catch((err) => {
			console.error("Durable Codebase Generation Worker fatal error:", err);
			process.exit(1);
		});
}
